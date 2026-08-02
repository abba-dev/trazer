using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Trazer.Api.Data;

namespace Trazer.Api.Services;

public static class ApiTokenDefaults
{
    public const string AuthenticationScheme = "ApiToken";
    public const string HeaderPrefix = "trz_";
}

public class ApiTokenHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public ApiTokenHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var token = header["Bearer ".Length..].Trim();
        if (!token.StartsWith(ApiTokenDefaults.HeaderPrefix))
            return AuthenticateResult.NoResult();

        var db = Context.RequestServices.GetRequiredService<TrazerDbContext>();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
        var user = await db.Users.SingleOrDefaultAsync(u => u.ApiTokenHash == hash);
        if (user is null || user.Disabled)
            return AuthenticateResult.Fail("Invalid API token");

        var identity = new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()) },
            Scheme.Name);
        return AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }
}
