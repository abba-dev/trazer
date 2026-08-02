using Trazer.Api.Domain;

namespace Trazer.Api.Common;

public record UserDto(Guid Id, string Email, string Name, bool IsAdmin, bool Disabled);

public record ProjectDto(Guid Id, string Key, string Name, string? Description, int IssueCount, DateTime CreatedAt);

public record IssueDto(
    Guid Id,
    string Key,
    int Number,
    string Title,
    string? Description,
    string Type,
    string Status,
    string Priority,
    Guid? AssigneeId,
    UserDto? Assignee,
    UserDto Reporter,
    Guid? EpicId,
    string? EpicName,
    Guid? SprintId,
    string? SprintName,
    Guid? ReleaseId,
    string? ReleaseName,
    List<LabelDto> Labels,
    int? Estimate,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record LabelDto(Guid Id, string Name, string Color);

public record EpicDto(Guid Id, string Name, string? Summary, string Color, int IssueCount);

public record SprintDto(Guid Id, string Name, string? Goal, DateTime? StartDate, DateTime? EndDate, bool IsActive, int IssueCount);

public record ReleaseDto(Guid Id, string Name, string? Description, string Status, DateTime? ReleasedAt, int IssueCount);

public record CommentDto(Guid Id, string Body, UserDto Author, DateTime CreatedAt);

public record HistoryEntryDto(Guid Id, string Field, string? OldValue, string? NewValue, UserDto Actor, DateTime CreatedAt);

public record AttachmentDto(Guid Id, string FileName, string ContentType, long Size, UserDto UploadedBy, DateTime UploadedAt);

public record SavedFilterDto(Guid Id, string Name, string Query, DateTime CreatedAt);

public record WebhookDto(Guid Id, string Url, string Events, string Secret, DateTime CreatedAt);

public static class Mapping
{
    public static UserDto ToDto(this User u) => new(u.Id, u.Email, u.Name, u.IsAdmin, u.Disabled);

    public static LabelDto ToDto(this Label l) => new(l.Id, l.Name, l.Color);

    public static EpicDto ToDto(this Epic e) => new(e.Id, e.Name, e.Summary, e.Color, e.Issues.Count);

    public static SprintDto ToDto(this Sprint s) =>
        new(s.Id, s.Name, s.Goal, s.StartDate, s.EndDate, s.IsActive, s.Issues.Count);

    public static ReleaseDto ToDto(this Release r) =>
        new(r.Id, r.Name, r.Description, r.Status.ToString(), r.ReleasedAt, r.Issues.Count);

    public static CommentDto ToDto(this Comment c) =>
        new(c.Id, c.Body, c.Author!.ToDto(), c.CreatedAt);

    public static HistoryEntryDto ToDto(this HistoryEntry h) =>
        new(h.Id, h.Field, h.OldValue, h.NewValue, h.Actor!.ToDto(), h.CreatedAt);

    public static AttachmentDto ToDto(this Attachment a) =>
        new(a.Id, a.FileName, a.ContentType, a.Size, a.UploadedBy!.ToDto(), a.UploadedAt);

    public static SavedFilterDto ToDto(this SavedFilter f) => new(f.Id, f.Name, f.Query, f.CreatedAt);

    public static WebhookDto ToDto(this Webhook w) => new(w.Id, w.Url, w.Events, w.Secret, w.CreatedAt);

    public static IssueDto ToDto(this Issue i) =>
        new(
            i.Id,
            i.Key,
            i.Number,
            i.Title,
            i.Description,
            i.Type.ToString(),
            i.Status.ToString(),
            i.Priority.ToString(),
            i.AssigneeId,
            i.Assignee?.ToDto(),
            i.Reporter?.ToDto() ?? new UserDto(Guid.Empty, string.Empty, string.Empty, false, false),
            i.EpicId,
            i.Epic?.Name,
            i.SprintId,
            i.Sprint?.Name,
            i.ReleaseId,
            i.Release?.Name,
            [.. i.IssueLabels.OrderBy(il => il.Label!.Name).Select(il => il.Label!.ToDto())],
            i.Estimate,
            i.CreatedAt,
            i.UpdatedAt);
}
