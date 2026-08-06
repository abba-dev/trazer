using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trazer.Api.Migrations
{
    /// <inheritdoc />
    public partial class IssueSourceKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WipLimits",
                table: "Projects",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceKey",
                table: "Issues",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Issues_ProjectId_SourceKey",
                table: "Issues",
                columns: new[] { "ProjectId", "SourceKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Issues_ProjectId_SourceKey",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "SourceKey",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "WipLimits",
                table: "Projects");
        }
    }
}
