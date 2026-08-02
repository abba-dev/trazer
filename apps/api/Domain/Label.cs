namespace Trazer.Api.Domain;

public class Label
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#808080";

    public Project? Project { get; set; }
    public List<IssueLabel> IssueLabels { get; set; } = [];
}

public class IssueLabel
{
    public Guid IssueId { get; set; }
    public Guid LabelId { get; set; }

    public Issue? Issue { get; set; }
    public Label? Label { get; set; }
}

public class Epic
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public string Color { get; set; } = "#808080";

    public Project? Project { get; set; }
    public List<Issue> Issues { get; set; } = [];
}
