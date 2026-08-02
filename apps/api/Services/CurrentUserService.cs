using System.Security.Claims;
using Trazer.Api.Common;

namespace Trazer.Api.Services;

public class CurrentUserService(IHttpContextAccessor accessor)
{
    public Guid CurrentUserId
    {
        get
        {
            var id = accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(id, out var userId))
                throw ApiException.Unauthorized();
            return userId;
        }
    }
}
