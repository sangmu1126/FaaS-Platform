function handler(event) {
    var request = event.request;
    var uri = request.uri;

    if (uri === '/api' || uri.indexOf('/api/') === 0) {
        return request;
    }

    var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (lastSegment.indexOf('.') === -1) {
        request.uri = '/index.html';
    }

    return request;
}
