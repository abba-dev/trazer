namespace Trazer.Api.Domain;

public class Webhook
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public string Url { get; set; } = string.Empty;
    // CSV of event names ("issue.created,issue.updated" or "*" for all)
    public string Events { get; set; } = "*";
    public string Secret { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Project Project { get; set; } = null!;
}
