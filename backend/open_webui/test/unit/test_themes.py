import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

pytest.importorskip("peewee")
pytest.importorskip("peewee_migrate")
pytest.importorskip("sqlalchemy")

from open_webui.routers import themes


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def theme_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(themes, "DATA_DIR", tmp_path)
    return tmp_path


def make_user(user_id="user-1"):
    return SimpleNamespace(id=user_id)


def make_theme(theme_id="halo-blue", name="Halo Blue", primary="#3b82f6"):
    return themes.ThemeFile(
        id=theme_id,
        name=name,
        colorMode="dark",
        tokens=themes.ThemeTokens(
            primary=primary,
            background="#0a0a0f",
            foreground="#f4f4f5",
            surface="#171717",
            radius="16px",
            glassOpacity=0.7,
        ),
        customCss=".halo-theme-test { color: var(--color-primary-500); }",
    )


def test_theme_crud_roundtrip():
    user = make_user()
    saved = run(themes.save_theme(make_theme(), user=user))

    assert saved.id == "halo-blue"
    assert run(themes.list_themes(user=user))[0].id == "halo-blue"
    assert run(themes.get_theme("halo-blue", user=user)).name == "Halo Blue"

    exported = run(themes.export_theme("halo-blue", user=user))
    assert exported.body

    assert run(themes.delete_theme("halo-blue", user=user)) == {"ok": True}
    with pytest.raises(HTTPException) as exc:
        run(themes.get_theme("halo-blue", user=user))
    assert exc.value.status_code == 404


def test_theme_files_are_isolated_by_user():
    run(themes.save_theme(make_theme(name="User One", primary="#111111"), user=make_user("user-1")))
    run(themes.save_theme(make_theme(name="User Two", primary="#222222"), user=make_user("user-2")))

    assert run(themes.get_theme("halo-blue", user=make_user("user-1"))).name == "User One"
    assert run(themes.get_theme("halo-blue", user=make_user("user-2"))).name == "User Two"


def test_rejects_path_traversal_and_invalid_payloads():
    with pytest.raises(HTTPException) as exc:
        run(themes.get_theme("../secret", user=make_user()))
    assert exc.value.status_code == 400

    with pytest.raises(ValidationError):
        make_theme(theme_id="../secret")

    with pytest.raises(ValidationError):
        themes.ThemeFile(
            id="too-large-css",
            name="Too Large",
            colorMode="dark",
            tokens=themes.ThemeTokens(),
            customCss="x" * (themes.MAX_CUSTOM_CSS_LENGTH + 1),
        )
