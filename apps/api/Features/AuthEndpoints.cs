using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class AuthEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/login", async (LoginRequest req, HttpRequest http, TrazerDbContext db, TokenService tokens, LoginThrottle throttle) =>
        {
            var ip = http.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

            var wait = throttle.Check(ip);
            if (wait > 0)
                return RateLimited(http, wait);

            var email = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email);

            if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            {
                throttle.ReportFailure(ip);
                return Results.Json(new { error = new { code = "invalid_credentials", message = "Invalid email or password" } },
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            if (user.Disabled)
            {
                throttle.ReportFailure(ip);
                return Results.Json(new { error = new { code = "account_disabled", message = "Account disabled" } },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            throttle.ReportSuccess(ip);
            return Results.Ok(new { token = tokens.CreateToken(user.Id, user.Email), user = user.ToDto() });
        });

        group.MapGet("/me", async (TrazerDbContext db, CurrentUserService current) =>
        {
            var user = await db.Users.FindAsync(current.CurrentUserId)
                ?? throw ApiException.Unauthorized();
            return Results.Ok(user.ToDto());
        }).RequireAuthorization();

        group.MapGet("/users", async (TrazerDbContext db) =>
            Results.Ok(await db.Users.OrderBy(u => u.Name).Select(u => u.ToDto()).ToListAsync())
        ).RequireAuthorization();

        // Admin-only: create a new account. Open self-registration is intentionally removed —
        // an admin grants every access.
        group.MapPost("/users", async (CreateUserRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            var actor = await db.Users.FindAsync(current.CurrentUserId)
                ?? throw ApiException.Unauthorized();
            if (!actor.IsAdmin)
                throw ApiException.Forbidden("Only admins can create accounts");

            var email = req.Email.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                throw ApiException.BadRequest("Password must be at least 8 characters");
            if (await db.Users.AnyAsync(u => u.Email == email))
                throw ApiException.Conflict("An account with this email already exists");

            var user = new User
            {
                Email = email,
                Name = req.Name.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                IsAdmin = req.IsAdmin
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Created($"/auth/me", user.ToDto());
        }).RequireAuthorization();

        // Admin-only: disable/enable an account or reset its password. An admin can't disable themselves.
        group.MapPatch("/users/{id}", async (Guid id, UpdateUserRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            var actor = await db.Users.FindAsync(current.CurrentUserId)
                ?? throw ApiException.Unauthorized();
            if (!actor.IsAdmin)
                throw ApiException.Forbidden("Only admins can modify accounts");

            var user = await db.Users.FindAsync(id)
                ?? throw ApiException.NotFound("User not found");
            if (user.Id == actor.Id && req.Disabled == true)
                throw ApiException.BadRequest("You cannot disable your own account");

            if (req.Disabled is { } disabled) user.Disabled = disabled;
            if (!string.IsNullOrEmpty(req.Password))
            {
                if (req.Password.Length < 8)
                    throw ApiException.BadRequest("Password must be at least 8 characters");
                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
            }
            await db.SaveChangesAsync();
            return Results.Ok(user.ToDto());
        }).RequireAuthorization();

        // Self-service API token for the public REST API. Stored as SHA-256; shown once.
        group.MapPost("/api-token", async (TrazerDbContext db, CurrentUserService current) =>
        {
            var user = await db.Users.FindAsync(current.CurrentUserId)
                ?? throw ApiException.Unauthorized();

            var token = ApiTokenDefaults.HeaderPrefix +
                Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48))
                    .Replace('+', '-').Replace('/', '_').TrimEnd('=');
            user.ApiTokenHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));
            user.ApiTokenCreatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { token });
        }).RequireAuthorization();

        group.MapDelete("/api-token", async (TrazerDbContext db, CurrentUserService current) =>
        {
            var user = await db.Users.FindAsync(current.CurrentUserId)
                ?? throw ApiException.Unauthorized();
            user.ApiTokenHash = null;
            user.ApiTokenCreatedAt = null;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        // Demo mode only (Demo__Enabled=true): one-click login as the seeded demo user.
        group.MapPost("/demo-login", async (HttpRequest http, IConfiguration config, TrazerDbContext db, TokenService tokens, LoginThrottle throttle) =>
        {
            if (!config.GetValue<bool>("Demo:Enabled"))
                throw ApiException.NotFound();

            var ip = http.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var wait = throttle.Check(ip);
            if (wait > 0)
                return RateLimited(http, wait);

            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == DemoDefaults.Email)
                ?? throw ApiException.BadRequest("Demo user not seeded");
            if (user.Disabled)
            {
                throttle.ReportFailure(ip);
                throw ApiException.BadRequest("Account disabled");
            }

            throttle.ReportSuccess(ip);
            return Results.Ok(new { token = tokens.CreateToken(user.Id, user.Email), user = user.ToDto() });
        });

        // Bootstrap the first admin on a fresh install. Only works when Users is
        // empty. Replaces the old OAuth-first-login bootstrap — run via the CLI:
        //   TRAZER_API=... npx trazer admin create --email=me@x --password=...
        group.MapPost("/admin", async (CreateAdminRequest req, TrazerDbContext db, TokenService tokens) =>
        {
            if (await db.Users.AnyAsync())
                throw ApiException.Forbidden("Admin bootstrap disabled (users already exist)");

            var email = req.Email.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                throw ApiException.BadRequest("Password must be at least 8 characters");
            if (await db.Users.AnyAsync(u => u.Email == email))
                throw ApiException.Conflict("An account with this email already exists");

            var user = new User
            {
                Email = email,
                Name = string.IsNullOrWhiteSpace(req.Name) ? email.Split('@')[0] : req.Name.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                IsAdmin = true,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Ok(new { token = tokens.CreateToken(user.Id, user.Email), user = user.ToDto() });
        });
    }
private static IResult RateLimited(HttpRequest http, int waitSeconds)
    {
        http.HttpContext.Response.Headers.RetryAfter = waitSeconds.ToString();
        return Results.Json(
            new { error = new { code = "rate_limited", message = $"Too many attempts. Try again in {waitSeconds}s." } },
            statusCode: StatusCodes.Status429TooManyRequests);
    }
}

public record LoginRequest(string Email, string Password);
public record CreateUserRequest(string Email, string Name, string Password, bool IsAdmin = false);
public record UpdateUserRequest(bool? Disabled, string? Password);
public record CreateAdminRequest(string Email, string Name, string Password);