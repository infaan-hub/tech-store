import os
import subprocess
import sys


def run_step(command):
    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "techstore_backend.settings")

    python_executable = sys.executable
    port = os.getenv("PORT", "10000")

    run_step([python_executable, "manage.py", "migrate", "--noinput"])
    run_step([python_executable, "manage.py", "collectstatic", "--noinput"])

    os.execvp(
        "gunicorn",
        [
            "gunicorn",
            "techstore_backend.wsgi:application",
            "--bind",
            f"0.0.0.0:{port}",
        ],
    )


if __name__ == "__main__":
    main()
