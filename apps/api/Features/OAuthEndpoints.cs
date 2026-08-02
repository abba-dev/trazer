using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Trazer.Api.Common;
using Trazer.Api.Data;
using Trazer.Api.Domain;
using Trazer.Api.Services;

namespace Trazer.Api.Features;

public static class OAuthEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapGet("/oauth/{provider}/begin", async (
            string provider, string? redirect, HttpContext ctx, OAuthService oauth) =>
        {
            if (!oauth.IsEnabled(provider))
                return Results.Json(new { error = new { code = "oauth_disabled", message = $"OAuth disabled for {provider}" } }, statusCode: 503);
            var target = string.IsNullOrWhiteSpace(redirect) ? "/projects" : redirect;
            if (!IsSafeRedirect(target))
                throw ApiException.BadRequest("Invalid redirect");
            var state = oauth.CreateState(target);
            ctx.Response.Cookies.Append("oauth_state", state, new CookieOptions
            {
                HttpOnly = true,
                SameSite = SameSiteMode.Lax,
                MaxAge = TimeSpan.FromMinutes(10),
                Path = "/api/auth/oauth",
            });
            return Results.Redirect(oauth.BuildAuthorizeUrl(provider.ToLowerInvariant(), state));
        });

        group.MapGet("/oauth/{provider}/callback", async (
            string provider, string? code, string? state, HttpContext ctx,
            OAuthService oauth, TrazerDbContext db, TokenService tokens) =>
        {
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
                throw ApiException.BadRequest("Missing code or state");
            var prov = provider.ToLowerInvariant();
            var cookie = ctx.Request.Cookies["oauth_state"];
            if (cookie is null || !CryptographicOperations.FixedTimeEquals(
                    System.Text.Encoding.UTF8.GetBytes(cookie), System.Text.Encoding.UTF8.GetBytes(state)))
                throw ApiException.BadRequest("Invalid state");
            var redirect = oauth.ValidateState(state);
            if (redirect is null)
                throw ApiException.BadRequest("Invalid state");
            ctx.Response.Cookies.Delete("oauth_state", new CookieOptions { Path = "/api/auth/oauth" });

            var info = await oauth.ExchangeAsync(prov, code, ctx.RequestAborted);
            var email = info.Email.Trim().ToLowerInvariant();

            // ponytail: bootstrap — with zero users there is no admin to fill the allowlist,
            // so the first successful OAuth login seeds the admin and bypasses the gate.
            var bootstrap = !await db.Users.AnyAsync(ctx.RequestAborted);
            if (!bootstrap)
            {
                var allowed = await db.AllowedEmails.AnyAsync(e => e.Email == email, ctx.RequestAborted)
                    || await db.AllowedDomains.AnyAsync(d => email.EndsWith("@" + d.Domain), ctx.RequestAborted);
                if (!allowed)
                    throw ApiException.Forbidden("Email is not whitelisted");
            }

            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email, ctx.RequestAborted);
            if (user is null)
            {
                user = new User
                {
                    Email = email,
                    Name = string.IsNullOrWhiteSpace(info.Name) ? email.Split('@')[0] : info.Name,
                    IsAdmin = bootstrap,
                };
                db.Users.Add(user);
                await db.SaveChangesAsync(ctx.RequestAborted);
            }
            else if (user.Disabled)
            {
                throw ApiException.Forbidden("Account disabled");
            }

            var identity = await db.UserIdentities.SingleOrDefaultAsync(
                i => i.Provider == prov && i.ExternalId == info.ExternalId, ctx.RequestAborted);
            if (identity is null)
            {
                db.UserIdentities.Add(new UserIdentity
                {
                    UserId = user.Id,
                    Provider = prov,
                    ExternalId = info.ExternalId,
                    Email = email,
                });
                await db.SaveChangesAsync(ctx.RequestAborted);
            }

            var origin = $"{ctx.Request.Scheme}://{ctx.Request.Host}";
            var separator = redirect.Contains('?') ? '&' : '?';
            return Results.Redirect($"{origin}{redirect}{separator}token={tokens.CreateToken(user.Id, user.Email)}");
        });

        group.MapGet("/allowed-domains", async (TrazerDbContext db) =>
            Results.Ok(await db.AllowedDomains.OrderBy(d => d.Domain).Select(d => d.ToDto()).ToListAsync())
        ).RequireAuthorization();

        group.MapPost("/allowed-domains", async (AllowlistRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            await RequireAdminAsync(db, current);
            var domain = req.Value.Trim().TrimStart('@').ToLowerInvariant();
            if (domain.Length == 0 || domain.Contains('@') || domain.Contains(' '))
                throw ApiException.BadRequest("Enter a domain like example.com");
            if (await db.AllowedDomains.AnyAsync(d => d.Domain == domain))
                throw ApiException.Conflict("Domain already whitelisted");
            var entry = new AllowedDomain { Domain = domain };
            db.AllowedDomains.Add(entry);
            await db.SaveChangesAsync();
            return Results.Created("/auth/allowed-domains", entry.ToDto());
        }).RequireAuthorization();

        group.MapDelete("/allowed-domains/{id}", async (Guid id, TrazerDbContext db, CurrentUserService current) =>
        {
            await RequireAdminAsync(db, current);
            var entry = await db.AllowedDomains.FindAsync(id) ?? throw ApiException.NotFound("Domain not found");
            db.AllowedDomains.Remove(entry);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        group.MapGet("/allowed-emails", async (TrazerDbContext db) =>
            Results.Ok(await db.AllowedEmails.OrderBy(e => e.Email).Select(e => e.ToDto()).ToListAsync())
        ).RequireAuthorization();

        group.MapPost("/allowed-emails", async (AllowlistRequest req, TrazerDbContext db, CurrentUserService current) =>
        {
            await RequireAdminAsync(db, current);
            var email = req.Value.Trim().ToLowerInvariant();
            if (!email.Contains('@') || email.Length > 320)
                throw ApiException.BadRequest("Enter a valid email");
            if (await db.AllowedEmails.AnyAsync(e => e.Email == email))
                throw ApiException.Conflict("Email already whitelisted");
            var entry = new AllowedEmail { Email = email };
            db.AllowedEmails.Add(entry);
            await db.SaveChangesAsync();
            return Results.Created("/auth/allowed-emails", entry.ToDto());
        }).RequireAuthorization();

        group.MapDelete("/allowed-emails/{id}", async (Guid id, TrazerDbContext db, CurrentUserService current) =>
        {
            await RequireAdminAsync(db, current);
            var entry = await db.AllowedEmails.FindAsync(id) ?? throw ApiException.NotFound("Email not found");
            db.AllowedEmails.Remove(entry);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();
    }

    private static async Task RequireAdminAsync(TrazerDbContext db, CurrentUserService current)
    {
        var actor = await db.Users.FindAsync(current.CurrentUserId) ?? throw ApiException.Unauthorized();
        if (!actor.IsAdmin)
            throw ApiException.Forbidden("Only admins can manage the allowlist");
    }

    private static bool IsSafeRedirect(string redirect) =>
        redirect.StartsWith('/') && !redirect.StartsWith("//") && !redirect.Contains('\n') && !redirect.Contains('\r');
}

public record AllowlistRequest(string Value);
