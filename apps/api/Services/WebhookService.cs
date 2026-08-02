using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Trazer.Api.Data;

namespace Trazer.Api.Services;

public class WebhookService(IHttpClientFactory httpFactory, ILogger<WebhookService> logger)
{
    // ponytail: fire-and-forget so a slow/unreachable endpoint never blocks the API response.
    // Ceiling: no retry/backoff — add a queue + retries if delivery matters enough to need them.
    public async Task DispatchAsync(TrazerDbContext db, Guid projectId, string eventName, Guid actorId, object payload)
    {
        var webhooks = await db.Webhooks
            .Where(w => w.ProjectId == projectId)
            .ToListAsync();
        if (webhooks.Count == 0) return;

        var actor = await db.Users
            .Where(u => u.Id == actorId)
            .Select(u => new { u.Email, u.Name })
            .FirstOrDefaultAsync();

        var body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            @event = eventName,
            at = DateTime.UtcNow,
            actor = actor is null ? null : new { actor.Email, actor.Name },
            data = payload
        }, new JsonSerializerOptions { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull });

        foreach (var hook in webhooks.Where(w => w.Events == "*" || w.Events.Split(',').Contains(eventName, StringComparer.OrdinalIgnoreCase)))
        {
            _ = DeliverAsync(hook.Url, hook.Secret, body);
        }
    }

    private async Task DeliverAsync(string url, string secret, byte[] body)
    {
        try
        {
            using var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new ByteArrayContent(body)
            };
            request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
            var signature = Convert.ToHexString(HmacSha256(secret, body)).ToLowerInvariant();
            request.Headers.Add("X-Trazer-Signature", $"sha256={signature}");

            using var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
                logger.LogWarning("Webhook {Url} returned {Status}", url, (int)response.StatusCode);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Webhook {Url} failed", url);
        }
    }

    public static byte[] HmacSha256(string secret, byte[] body)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return hmac.ComputeHash(body);
    }
}
