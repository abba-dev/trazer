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
        var group = app.MapGroup("/auth");

        group.MapPost("/register", async (RegisterRequest req, TrazerDbContext db) =>
        {
            var email = req.Email.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
                throw ApiException.BadRequest("Password must be at least 8 characters");

            if (await db.Users.AnyAsync(u => u.Email == email))
                throw ApiException.Conflict("An account with this email already exists");

            var user = new User
            {
                Email = email,
                Name = req.Name.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password)
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Created($"/auth/me", new { user = user.ToDto() });
        });

        group.MapPost("/login", async (LoginRequest req, TrazerDbContext db, TokenService tokens) =>
        {
            var email = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email)
                ?? throw ApiException.BadRequest("Invalid email or password");

            if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                throw ApiException.BadRequest("Invalid email or password");

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
    }
}

public record RegisterRequest(string Email, string Name, string Password);

public record LoginRequest(string Email, string Password);
