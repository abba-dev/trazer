using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Trazer.Api.Common;

namespace Trazer.Api.Services;

// ponytail: hand-rolled OIDC code exchange instead of ASP.NET Identity/OpenIddict —
// two providers, no local identity stores, ~100 lines. A framework adds nothing here.
public class OAuthService(IConfiguration config, HttpClient http)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public bool IsEnabled(string provider) =>
        !string.IsNullOrEmpty(config[$"{provider}:ClientId"]) &&
        !string.IsNullOrEmpty(config[$"{provider}:ClientSecret"]);

    public string CreateState(string redirect)
    {
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(
            new StatePayload(redirect, DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds()))));
        return $"{payload}.{Sign(payload)}";
    }

    public string? ValidateState(string state)
    {
        var parts = state.Split('.');
        if (parts.Length != 2) return null;
        try
        {
            var expected = Sign(parts[0]);
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Convert.FromBase64String(parts[1])))
                return null;
            var payload = JsonSerializer.Deserialize<StatePayload>(Encoding.UTF8.GetString(Convert.FromBase64String(parts[0])), Json);
            if (payload is null || payload.Exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;
            return payload.Redirect;
        }
        catch (FormatException)
        {
            return null;
        }
    }

    public string BuildAuthorizeUrl(string provider, string state)
    {
        var redirectUri = config[$"{provider}:RedirectUri"]!;
        return provider switch
        {
            "google" =>
                $"https://accounts.google.com/o/oauth2/v2/auth?client_id={config["Google:ClientId"]}&redirect_uri={Uri.EscapeDataString(redirectUri)}&response_type=code&scope=openid%20email%20profile&state={Uri.EscapeDataString(state)}",
            "github" =>
                $"https://github.com/login/oauth/authorize?client_id={config["GitHub:ClientId"]}&redirect_uri={Uri.EscapeDataString(redirectUri)}&scope=user:email&state={Uri.EscapeDataString(state)}",
            _ => throw ApiException.BadRequest("Unknown OAuth provider"),
        };
    }

    public async Task<OAuthUserInfo> ExchangeAsync(string provider, string code, CancellationToken ct)
    {
        return provider switch
        {
            "google" => await ExchangeGoogleAsync(code, ct),
            "github" => await ExchangeGitHubAsync(code, ct),
            _ => throw ApiException.BadRequest("Unknown OAuth provider"),
        };
    }

    private async Task<OAuthUserInfo> ExchangeGoogleAsync(string code, CancellationToken ct)
    {
        var token = await PostTokenAsync("https://oauth2.googleapis.com/token", code, "Google", ct);
        var request = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v3/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        using var resp = await http.SendAsync(request, ct);
        if (!resp.IsSuccessStatusCode)
            throw ApiException.Unauthorized("Failed to fetch Google profile");
        var info = await resp.Content.ReadFromJsonAsync<GoogleUserInfo>(Json, ct)
            ?? throw ApiException.Unauthorized("Failed to fetch Google profile");
        if (info.Email is null || info.EmailVerified != true)
            throw ApiException.Forbidden("Google email is not verified");
        return new OAuthUserInfo(info.Email, info.Name, info.Sub ?? info.Email);
    }

    private async Task<OAuthUserInfo> ExchangeGitHubAsync(string code, CancellationToken ct)
    {
        var token = await PostTokenAsync("https://github.com/login/oauth/access_token", code, "GitHub", ct);
        var profile = await GetJsonAsync<GitHubUser>("https://api.github.com/user", token.AccessToken, ct)
            ?? throw ApiException.Unauthorized("Failed to fetch GitHub profile");
        var emails = await GetJsonAsync<GitHubEmail[]>("https://api.github.com/user/emails", token.AccessToken, ct) ?? [];
        var email = emails.FirstOrDefault(e => e.Verified && e.Primary)?.Email
            ?? emails.FirstOrDefault(e => e.Verified)?.Email
            ?? throw ApiException.Forbidden("No verified GitHub email");
        return new OAuthUserInfo(email, profile.Name ?? profile.Login, profile.Id.ToString());
    }

    private async Task<TokenResponse> PostTokenAsync(string endpoint, string code, string provider, CancellationToken ct)
    {
        using var resp = await http.PostAsync(endpoint, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = config[$"{provider}:ClientId"]!,
            ["client_secret"] = config[$"{provider}:ClientSecret"]!,
            ["redirect_uri"] = config[$"{provider}:RedirectUri"]!,
            ["grant_type"] = "authorization_code",
        }), ct);
        if (!resp.IsSuccessStatusCode)
            throw ApiException.Unauthorized($"OAuth token exchange with {provider} failed");
        var token = await resp.Content.ReadFromJsonAsync<TokenResponse>(Json, ct);
        var accessToken = token?.AccessToken;
        if (accessToken is null)
            throw ApiException.Unauthorized($"OAuth token exchange with {provider} failed");
        return new TokenResponse(accessToken);
    }

    private async Task<T?> GetJsonAsync<T>(string url, string accessToken, CancellationToken ct)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        // GitHub API rejects requests without a User-Agent
        request.Headers.UserAgent.TryParseAdd("Trazer/1.0");
        using var resp = await http.SendAsync(request, ct);
        if (!resp.IsSuccessStatusCode) return default;
        return await resp.Content.ReadFromJsonAsync<T>(Json, ct);
    }

    private string Sign(string payload) =>
        Convert.ToBase64String(new HMACSHA256(Encoding.UTF8.GetBytes(config["Jwt:Key"]!)).ComputeHash(Encoding.UTF8.GetBytes(payload)));

    public record OAuthUserInfo(string Email, string? Name, string ExternalId);

    private record StatePayload(string Redirect, long Exp);
    private record TokenResponse(string AccessToken);
    private record GoogleUserInfo(string? Email, bool? EmailVerified, string? Name, string? Sub);
    private record GitHubUser(long Id, string? Login, string? Name);
    private record GitHubEmail(string? Email, bool Verified, bool Primary);
}
