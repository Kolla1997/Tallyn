// Command server runs the Tallyn API and serves the built React app (web/dist).
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Kolla1997/Tallyn/internal/api"
)

func main() {
	port := getenv("PORT", "8080")
	webDir := getenv("WEB_DIR", "web/dist")

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.NewRouter(webDir),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// TODO(#9): start the scheduled bank sync alongside the HTTP server.

	go func() {
		log.Printf("tallyn: listening on :%s (web: %s)", port, webDir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("tallyn: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("tallyn: shutdown: %v", err)
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
