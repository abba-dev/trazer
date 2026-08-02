namespace Trazer.Api.Domain;

public enum IssueType
{
    Task,
    Bug,
    Story
}

public enum IssueStatus
{
    ToDo,
    InProgress,
    InReview,
    QA,
    Done
}

public enum IssuePriority
{
    Low,
    Medium,
    High,
    Urgent
}

public enum ReleaseStatus
{
    Open,
    Released
}
