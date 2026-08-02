using Microsoft.EntityFrameworkCore;

namespace Trazer.Api.Common;

public class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (ApiException ex)
        {
            context.Response.StatusCode = ex.StatusCode;
            await context.Response.WriteAsJsonAsync(new { error = new { code = ex.Code, message = ex.Message } });
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase) == true)
        {
            context.Response.StatusCode = 409;
            await context.Response.WriteAsJsonAsync(new { error = new { code = "conflict", message = "A record with the same unique value already exists" } });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error");
            context.Response.StatusCode = 500;
            await context.Response.WriteAsJsonAsync(new { error = new { code = "internal", message = "Internal server error" } });
        }
    }
}
