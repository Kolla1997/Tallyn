package db

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

// Every SQL statement the app runs must be fixed text, with user values passed
// as parameters ($1, $2...). Building SQL from strings at runtime is how SQL
// injection happens, and the database's role limits (ADR 0006) are only the
// second lock. This test fails if any Query, QueryRow, Exec or Queue call in
// non-test code gets SQL that isn't a compile-time constant.
func TestSQLIsAlwaysConstant(t *testing.T) {
	fset := token.NewFileSet()
	checked := 0
	for _, root := range []string{"../../internal", "../../cmd"} {
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return err
			}
			file, err := parser.ParseFile(fset, path, nil, 0)
			if err != nil {
				return err
			}
			n, problems := checkSQL(fset, file)
			checked += n
			for _, p := range problems {
				t.Error(p)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	// 26 SQL calls when this was written; a much lower count means the scan broke.
	if checked < 20 {
		t.Fatalf("only %d SQL calls found; the scan is probably broken", checked)
	}
}

// The check itself must catch unsafe SQL.
func TestSQLCheckCatchesInjectionRisks(t *testing.T) {
	src := `package x
const cols = "id, name"
func f(tx Tx, b Batch, name, id string) {
	tx.QueryRow(ctx, "select " + cols + " from t where id = $1", id)          // ok: constant
	tx.Exec(ctx, "delete from t where name = '" + name + "'")                 // bad: concatenated value
	tx.Query(ctx, fmt.Sprintf("select * from t where id = %s", id))           // bad: formatted
	sql := "select 1"
	tx.Exec(ctx, sql)                                                          // bad: variable
	b.Queue("update t set name = $1", name)                                   // ok
	b.Queue("update t set " + name + " = 1")                                  // bad
}`
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "x.go", src, 0)
	if err != nil {
		t.Fatal(err)
	}
	n, problems := checkSQL(fset, file)
	if n != 6 || len(problems) != 4 {
		t.Fatalf("checked %d calls, %d problems, want 6 and 4:\n%s", n, len(problems), strings.Join(problems, "\n"))
	}
}

// checkSQL returns how many SQL calls a file has and a message for each one
// whose SQL isn't a compile-time constant string.
func checkSQL(fset *token.FileSet, file *ast.File) (int, []string) {
	sqlArg := map[string]int{"Query": 1, "QueryRow": 1, "Exec": 1, "Queue": 0}
	consts := map[string]bool{}
	for _, decl := range file.Decls {
		if gd, ok := decl.(*ast.GenDecl); ok && gd.Tok == token.CONST {
			for _, spec := range gd.Specs {
				for _, n := range spec.(*ast.ValueSpec).Names {
					consts[n.Name] = true
				}
			}
		}
	}
	checked := 0
	var problems []string
	ast.Inspect(file, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		idx, ok := sqlArg[sel.Sel.Name]
		if !ok || len(call.Args) <= idx || !looksLikeSQLCall(call.Args, idx) {
			return true
		}
		checked++
		if !isConstString(call.Args[idx], consts) {
			problems = append(problems, fmt.Sprintf("%s: SQL passed to %s isn't fixed text; pass values as $N parameters",
				fset.Position(call.Pos()), sel.Sel.Name))
		}
		return true
	})
	return checked, problems
}

// looksLikeSQLCall skips calls like http.Client.Do or strings.Builder: the
// argument at idx must be a string expression (literal, constant name or
// concatenation), or anything that isn't obviously a non-string.
func looksLikeSQLCall(args []ast.Expr, idx int) bool {
	switch a := args[idx].(type) {
	case *ast.BasicLit:
		return a.Kind == token.STRING
	case *ast.BinaryExpr, *ast.Ident, *ast.CallExpr:
		return true
	}
	return false
}

func isConstString(e ast.Expr, consts map[string]bool) bool {
	switch v := e.(type) {
	case *ast.BasicLit:
		return v.Kind == token.STRING
	case *ast.Ident:
		return consts[v.Name]
	case *ast.ParenExpr:
		return isConstString(v.X, consts)
	case *ast.BinaryExpr:
		return v.Op == token.ADD && isConstString(v.X, consts) && isConstString(v.Y, consts)
	}
	return false
}
