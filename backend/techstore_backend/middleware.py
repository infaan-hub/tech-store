import re

from django.conf import settings
from django.http import HttpResponse


class ApiCorsFallbackMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin", "")
        allowed_origins = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        allowed_regexes = getattr(settings, "CORS_ALLOWED_ORIGIN_REGEXES", [])
        origin_allowed = origin in allowed_origins or any(re.match(pattern, origin) for pattern in allowed_regexes)

        if request.path.startswith("/api/") and request.method == "OPTIONS" and origin_allowed:
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        if request.path.startswith("/api/") and origin_allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Vary"] = "Origin"
            response["Access-Control-Allow-Methods"] = "DELETE, GET, OPTIONS, PATCH, POST, PUT"
            response["Access-Control-Allow-Headers"] = "authorization, content-type, x-csrftoken"
            response["Access-Control-Max-Age"] = "86400"

        return response
