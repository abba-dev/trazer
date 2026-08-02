using Microsoft.EntityFrameworkCore;
using Trazer.Api.Data;
using Trazer.Api.Domain;

namespace Trazer.Api.Services;

public static class DbSeeder
{
    public static async Task SeedAsync(TrazerDbContext db)
    {
        if (await db.Users.AnyAsync())
            return;

        var user = new User
        {
            Email = "demo@trazer.dev",
            Name = "Demo User",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("password123")
        };
        db.Users.Add(user);

        var project = new Project
        {
            Key = "GAME",
            Name = "Game Project",
            Description = "Demo project for the game engine rewrite",
            OwnerId = user.Id,
            LastIssueNumber = 0
        };
        project.Members.Add(new ProjectMember { UserId = user.Id, Role = "owner" });
        db.Projects.Add(project);

        var labels = new[]
        {
            new Label { ProjectId = project.Id, Name = "frontend", Color = "#4f46e5" },
            new Label { ProjectId = project.Id, Name = "backend", Color = "#059669" },
            new Label { ProjectId = project.Id, Name = "bug", Color = "#dc2626" },
            new Label { ProjectId = project.Id, Name = "design", Color = "#d97706" }
        };
        db.Labels.AddRange(labels);

        var epicCore = new Epic { ProjectId = project.Id, Name = "Core Systems", Summary = "Engine foundations", Color = "#dc2626" };
        var epicGfx = new Epic { ProjectId = project.Id, Name = "Graphics", Summary = "Rendering pipeline", Color = "#7c3aed" };
        var epicUi = new Epic { ProjectId = project.Id, Name = "UI / UX", Summary = "Menus and HUD", Color = "#d97706" };
        db.Epics.AddRange(epicCore, epicGfx, epicUi);

        var sprint1 = new Sprint { ProjectId = project.Id, Name = "Sprint 1", Goal = "Engine foundations", IsActive = true };
        var sprint2 = new Sprint { ProjectId = project.Id, Name = "Sprint 2", Goal = "Rendering bootstrap" };
        db.Sprints.AddRange(sprint1, sprint2);

        var release = new Release { ProjectId = project.Id, Name = "v0.1", Description = "Internal alpha" };
        db.Releases.Add(release);

        var seed = new (string title, string? desc, IssueType type, IssueStatus status, IssuePriority priority, Epic epic, Sprint? sprint, Label label, int? estimate)[]
        {
            ("Set up project scaffolding", "Monorepo with api and web apps.", IssueType.Task, IssueStatus.Done, IssuePriority.High, epicCore, sprint1, labels[1], 3),
            ("Entity framework data model", "Users, projects, issues, history.", IssueType.Task, IssueStatus.Done, IssuePriority.High, epicCore, sprint1, labels[1], 5),
            ("Auth: register and login", "JWT + bcrypt, /auth endpoints.", IssueType.Task, IssueStatus.InReview, IssuePriority.High, epicCore, sprint1, labels[1], 3),
            ("Board drag and drop", "dnd-kit kanban columns.", IssueType.Story, IssueStatus.InProgress, IssuePriority.Medium, epicUi, sprint1, labels[0], 5),
            ("Sidebar navigation", "Project list and topbar with Ctrl+K.", IssueType.Story, IssueStatus.InProgress, IssuePriority.Medium, epicUi, sprint2, labels[0], 3),
            ("Rendering pipeline stub", "First triangle on screen.", IssueType.Task, IssueStatus.ToDo, IssuePriority.Medium, epicGfx, sprint2, labels[1], 8),
            ("Input system: keyboard", "Key events routed to actions.", IssueType.Story, IssueStatus.ToDo, IssuePriority.Low, epicGfx, null, labels[1], 5),
            ("Login form is misaligned", "Input fields overlap on 1366px.", IssueType.Bug, IssueStatus.QA, IssuePriority.Urgent, epicUi, sprint1, labels[2], 1),
            ("Optimistic updates in query cache", "Avoid flicker on drag and drop.", IssueType.Task, IssueStatus.ToDo, IssuePriority.Medium, epicUi, null, labels[0], 3),
            ("Design system tokens", "Neutral palette, Inter, dense spacing.", IssueType.Task, IssueStatus.Done, IssuePriority.Medium, epicUi, sprint1, labels[3], 2),
            ("Search with TQ parser", "Grammar for assignee, status, project.", IssueType.Story, IssueStatus.ToDo, IssuePriority.High, epicCore, sprint2, labels[0], 8),
            ("Release notes view", "Group issues by release status.", IssueType.Story, IssueStatus.ToDo, IssuePriority.Low, epicUi, null, labels[3], 3)
        };

        var number = 1;
        Issue? firstIssue = null;
        foreach (var (title, desc, type, status, priority, epic, sprint, label, estimate) in seed)
        {
            project.LastIssueNumber = number;
            var issue = new Issue
            {
                ProjectId = project.Id,
                Number = number,
                Title = title,
                Description = desc,
                Type = type,
                Status = status,
                Priority = priority,
                ReporterId = user.Id,
                AssigneeId = user.Id,
                EpicId = epic.Id,
                SprintId = sprint?.Id,
                ReleaseId = status == IssueStatus.Done ? release.Id : null,
                Estimate = estimate,
                Position = number
            };
            issue.IssueLabels.Add(new IssueLabel { IssueId = issue.Id, LabelId = label.Id });
            db.Issues.Add(issue);
            db.HistoryEntries.Add(new HistoryEntry
            {
                IssueId = issue.Id,
                ActorId = user.Id,
                Field = "created",
                OldValue = null,
                NewValue = title
            });
            firstIssue ??= issue;
            number++;
        }

        if (firstIssue is not null)
        {
            db.Comments.Add(new Comment
            {
                IssueId = firstIssue.Id,
                AuthorId = user.Id,
                Body = "This looks like a good starting point. Let's iterate on it in the next review."
            });
        }

        await db.SaveChangesAsync();
    }
}
