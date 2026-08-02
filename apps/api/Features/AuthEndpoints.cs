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

        group.MapPost("/login", async (LoginRequest req, TrazerDbContext db, TokenService tokens) =>
        {
            var email = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email)
                ?? throw ApiException.BadRequest("Invalid email or password");

            if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                throw ApiException.BadRequest("Invalid email or password");

            if (user.Disabled)
                throw ApiException.BadRequest("Account disabled");

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
        // an admin grants every access. ponytail: OAuth whitelisting deferred to V1.
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
    }
}

public record LoginRequest(string Email, string Password);
public record CreateUserRequest(string Email, string Name, string Password, bool IsAdmin = false);
public record UpdateUserRequest(bool? Disabled, string? Password);