namespace Trazer.Api.Domain;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public int LastIssueNumber { get; set; }
    /// <summary>JSON object: { "ToDo": 5, "InProgress": 3, ... }. Per-status WIP cap. Null = no limit.</summary>
    public string? WipLimits { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? Owner { get; set; }
    public List<Issue> Issues { get; set; } = [];
    public List<Label> Labels { get; set; } = [];
    public List<Epic> Epics { get; set; } = [];
    public List<Sprint> Sprints { get; set; } = [];
    public List<Release> Releases { get; set; } = [];
    public List<ProjectMember> Members { get; set; } = [];
}

public class ProjectMember
{
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "member";

    public Project? Project { get; set; }
    public User? User { get; set; }
}
