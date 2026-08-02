using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Trazer.Api.Migrations
{
    /// <inheritdoc />
    public partial class UserAdmin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAdmin",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // ponytail: one-time backfill of the dev seed user to admin. Fresh installs skip this (no users yet); the seeder grants admin to the first user going forward.
            migrationBuilder.Sql("UPDATE \"Users\" SET \"IsAdmin\" = true WHERE \"Email\" = 'demo@trazer.dev'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsAdmin",
                table: "Users");
        }
    }
}
