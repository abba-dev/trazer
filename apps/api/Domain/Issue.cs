namespace Trazer.Api.Domain;

public class Issue
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public int Number { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public IssueType Type { get; set; } = IssueType.Task;
    public IssueStatus Status { get; set; } = IssueStatus.ToDo;
    public IssuePriority Priority { get; set; } = IssuePriority.Medium;
    public Guid? AssigneeId { get; set; }
    public Guid ReporterId { get; set; }
    public Guid? EpicId { get; set; }
    public Guid? SprintId { get; set; }
    public Guid? ReleaseId { get; set; }
    public int? Estimate { get; set; }
    public int Position { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public string Key => $"{Project?.Key ?? string.Empty}-{Number}";

    /// <summary>Original key from an external system (e.g. JIRA-123) — set on import so
    /// re-importing the same file updates instead of duplicating. Null for native issues.</summary>
    public string? SourceKey { get; set; }

    /// <summary>Linked pull request surfaced in the issue panel (set by the Git webhook).</summary>
    public string? PullRequestUrl { get; set; }
    public string? PullRequestState { get; set; }

    public Project? Project { get; set; }
    public User? Assignee { get; set; }
    public User? Reporter { get; set; }
    public Epic? Epic { get; set; }
    public Sprint? Sprint { get; set; }
    public Release? Release { get; set; }
    public List<Comment> Comments { get; set; } = [];
    public List<HistoryEntry> History { get; set; } = [];
    public List<Attachment> Attachments { get; set; } = [];
    public List<IssueLabel> IssueLabels { get; set; } = [];
}
