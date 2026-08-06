using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trazer.Api.Migrations
{
    /// <inheritdoc />
    public partial class GitIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "WipLimits",
                table: "Projects",
                type: "character varying(4096)",
                maxLength: 4096,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GitSecret",
                table: "Projects",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PullRequestState",
                table: "Issues",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PullRequestUrl",
                table: "Issues",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GitSecret",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "PullRequestState",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "PullRequestUrl",
                table: "Issues");

            migrationBuilder.AlterColumn<string>(
                name: "WipLimits",
                table: "Projects",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(4096)",
                oldMaxLength: 4096,
                oldNullable: true);
        }
    }
}
