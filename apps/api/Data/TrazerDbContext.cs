using Microsoft.EntityFrameworkCore;
using Trazer.Api.Domain;

namespace Trazer.Api.Data;

public class TrazerDbContext(DbContextOptions<TrazerDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<Issue> Issues => Set<Issue>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<HistoryEntry> HistoryEntries => Set<HistoryEntry>();
    public DbSet<Label> Labels => Set<Label>();
    public DbSet<IssueLabel> IssueLabels => Set<IssueLabel>();
    public DbSet<Epic> Epics => Set<Epic>();
    public DbSet<Sprint> Sprints => Set<Sprint>();
    public DbSet<Release> Releases => Set<Release>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<SavedFilter> SavedFilters => Set<SavedFilter>();
    public DbSet<Webhook> Webhooks => Set<Webhook>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(320);
            e.Property(u => u.Name).HasMaxLength(120);
        });

        modelBuilder.Entity<Project>(e =>
        {
            e.HasIndex(p => p.Key).IsUnique();
            e.Property(p => p.Key).HasMaxLength(10);
            e.Property(p => p.Name).HasMaxLength(120);
            e.Property(p => p.WipLimits).HasMaxLength(4096);
            e.Property(p => p.GitSecret).HasMaxLength(128);
            e.HasOne(p => p.Owner)
                .WithMany()
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ProjectMember>(e =>
        {
            e.HasKey(pm => new { pm.ProjectId, pm.UserId });
            e.Property(pm => pm.Role).HasMaxLength(32);
            e.HasOne(pm => pm.Project)
                .WithMany(p => p.Members)
                .HasForeignKey(pm => pm.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(pm => pm.User)
                .WithMany()
                .HasForeignKey(pm => pm.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Issue>(e =>
        {
            e.HasIndex(i => new { i.ProjectId, i.Number }).IsUnique();
            e.HasIndex(i => i.Status);
            e.HasIndex(i => i.AssigneeId);
            e.Property(i => i.SourceKey).HasMaxLength(64);
            e.HasIndex(i => new { i.ProjectId, i.SourceKey }).IsUnique();
            e.Property(i => i.Title).HasMaxLength(500);
            e.Property(i => i.Type).HasConversion<string>().HasMaxLength(16);
            e.Property(i => i.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(i => i.Priority).HasConversion<string>().HasMaxLength(16);
            e.Property(i => i.PullRequestUrl).HasMaxLength(2000);
            e.Property(i => i.PullRequestState).HasMaxLength(16);

            e.HasOne(i => i.Project)
                .WithMany(p => p.Issues)
                .HasForeignKey(i => i.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Assignee)
                .WithMany()
                .HasForeignKey(i => i.AssigneeId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(i => i.Reporter)
                .WithMany()
                .HasForeignKey(i => i.ReporterId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(i => i.Epic)
                .WithMany(ep => ep.Issues)
                .HasForeignKey(i => i.EpicId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(i => i.Sprint)
                .WithMany(s => s.Issues)
                .HasForeignKey(i => i.SprintId)
                .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(i => i.Release)
                .WithMany(r => r.Issues)
                .HasForeignKey(i => i.ReleaseId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Comment>(e =>
        {
            e.Property(c => c.Body).HasColumnType("text");
            e.HasOne(c => c.Issue)
                .WithMany(i => i.Comments)
                .HasForeignKey(c => c.IssueId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author)
                .WithMany()
                .HasForeignKey(c => c.AuthorId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<HistoryEntry>(e =>
        {
            e.Property(h => h.Field).HasMaxLength(32);
            e.Property(h => h.OldValue).HasMaxLength(2000);
            e.Property(h => h.NewValue).HasMaxLength(2000);
            e.HasIndex(h => new { h.IssueId, h.CreatedAt });
            e.HasOne(h => h.Issue)
                .WithMany(i => i.History)
                .HasForeignKey(h => h.IssueId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(h => h.Actor)
                .WithMany()
                .HasForeignKey(h => h.ActorId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Label>(e =>
        {
            e.HasIndex(l => new { l.ProjectId, l.Name }).IsUnique();
            e.Property(l => l.Name).HasMaxLength(60);
            e.Property(l => l.Color).HasMaxLength(9);
            e.HasOne(l => l.Project)
                .WithMany(p => p.Labels)
                .HasForeignKey(l => l.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<IssueLabel>(e =>
        {
            e.HasKey(il => new { il.IssueId, il.LabelId });
            e.HasOne(il => il.Issue)
                .WithMany(i => i.IssueLabels)
                .HasForeignKey(il => il.IssueId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(il => il.Label)
                .WithMany(l => l.IssueLabels)
                .HasForeignKey(il => il.LabelId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Epic>(e =>
        {
            e.Property(ep => ep.Name).HasMaxLength(120);
            e.Property(ep => ep.Color).HasMaxLength(9);
            e.HasOne(ep => ep.Project)
                .WithMany(p => p.Epics)
                .HasForeignKey(ep => ep.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Sprint>(e =>
        {
            e.Property(s => s.Name).HasMaxLength(120);
            e.Property(s => s.Goal).HasMaxLength(500);
            e.HasOne(s => s.Project)
                .WithMany(p => p.Sprints)
                .HasForeignKey(s => s.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Release>(e =>
        {
            e.Property(r => r.Name).HasMaxLength(120);
            e.Property(r => r.Description).HasMaxLength(2000);
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(16);
            e.HasOne(r => r.Project)
                .WithMany(p => p.Releases)
                .HasForeignKey(r => r.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Attachment>(e =>
        {
            e.Property(a => a.FileName).HasMaxLength(255);
            e.Property(a => a.StoredName).HasMaxLength(128);
            e.Property(a => a.ContentType).HasMaxLength(128);
            e.HasOne(a => a.Issue)
                .WithMany(i => i.Attachments)
                .HasForeignKey(a => a.IssueId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.UploadedBy)
                .WithMany()
                .HasForeignKey(a => a.UploadedById)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SavedFilter>(e =>
        {
            e.HasIndex(f => new { f.UserId, f.Name }).IsUnique();
            e.Property(f => f.Name).HasMaxLength(120);
            e.Property(f => f.Query).HasMaxLength(2000);
            e.HasOne<User>()
                .WithMany()
                .HasForeignKey(f => f.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Webhook>(e =>
        {
            e.Property(w => w.Url).HasMaxLength(2000);
            e.Property(w => w.Events).HasMaxLength(200);
            e.Property(w => w.Secret).HasMaxLength(128);
            e.HasOne(w => w.Project)
                .WithMany()
                .HasForeignKey(w => w.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
