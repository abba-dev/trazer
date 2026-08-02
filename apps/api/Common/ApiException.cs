namespace Trazer.Api.Common;

public class ApiException(int statusCode, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;

    public static ApiException NotFound(string message = "Resource not found") =>
        new(404, "not_found", message);

    public static ApiException Conflict(string message) =>
        new(409, "conflict", message);

    public static ApiException Unauthorized(string message = "Authentication required") =>
        new(401, "unauthorized", message);

    public static ApiException Forbidden(string message = "Insufficient permissions") =>
        new(403, "forbidden", message);

    public static ApiException BadRequest(string message) =>
        new(400, "bad_request", message);
}
