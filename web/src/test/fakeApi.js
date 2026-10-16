// Screen tests (#114): answers for the mocked api(), by path. Each route is
// [prefix or RegExp, answer]; the first that matches wins. An answer can be a
// value, a function of (path, options), or an Error to reject with.
export function routeApi(apiMock, routes) {
  apiMock.mockImplementation(async (path, opts) => {
    const hit = routes.find(([match]) => (match instanceof RegExp ? match.test(path) : path.startsWith(match)))
    if (!hit) throw new Error(`no fake answer for ${opts?.method ?? 'GET'} ${path}`)
    const answer = typeof hit[1] === 'function' ? hit[1](path, opts) : hit[1]
    if (answer instanceof Error) throw answer
    return answer
  })
}

// Calls the mock got for a path prefix, as [path, options].
export const callsTo = (apiMock, prefix, method = 'GET') =>
  apiMock.mock.calls.filter(([path, opts]) => path.startsWith(prefix) && (opts?.method ?? 'GET') === method)
