import hashlib
import json
import logging
import re
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from open_webui.env import DATA_DIR, SRC_LOG_LEVELS
from open_webui.utils.auth import get_verified_user

log = logging.getLogger(__name__)
log.setLevel(SRC_LOG_LEVELS["MAIN"])

router = APIRouter()

THEME_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")
HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
RADIUS_RE = re.compile(r"^\d+(\.\d+)?(px|rem|em|%)$")
MAX_CUSTOM_CSS_LENGTH = 20_000
MAX_THEME_JSON_BYTES = 100_000


class ThemeTokens(BaseModel):
    primary: str = "#3b82f6"
    background: str = "#0a0a0f"
    foreground: str = "#f4f4f5"
    surface: str = "#171717"
    radius: str = "16px"
    glassOpacity: float = Field(default=0.7, ge=0, le=1)

    model_config = ConfigDict(extra="allow")

    @field_validator("primary", "background", "foreground", "surface")
    @classmethod
    def validate_hex_color(cls, value: str):
        if not HEX_COLOR_RE.match(value):
            raise ValueError("Expected a hex color.")
        return value.lower()

    @field_validator("radius")
    @classmethod
    def validate_radius(cls, value: str):
        if not RADIUS_RE.match(value):
            raise ValueError("Expected px, rem, em, or % radius.")
        return value


class ThemeFile(BaseModel):
    schemaVersion: Literal[1] = 1
    id: str
    name: str = Field(min_length=1, max_length=80)
    colorMode: Literal["light", "dark", "system"] = "dark"
    tokens: ThemeTokens
    customCss: str = ""

    model_config = ConfigDict(extra="allow")

    @field_validator("id")
    @classmethod
    def validate_theme_id(cls, value: str):
        if not THEME_ID_RE.match(value):
            raise ValueError("Theme id may only contain letters, numbers, hyphens, and underscores.")
        return value

    @field_validator("customCss")
    @classmethod
    def validate_custom_css(cls, value: str):
        if len(value) > MAX_CUSTOM_CSS_LENGTH:
            raise ValueError(f"Custom CSS must be {MAX_CUSTOM_CSS_LENGTH} characters or fewer.")
        return value


class ThemeSummary(BaseModel):
    id: str
    name: str
    colorMode: Literal["light", "dark", "system"]
    updatedAt: float
    size: int


class ImportThemeForm(BaseModel):
    theme: ThemeFile


def _themes_root() -> Path:
    root = Path(DATA_DIR).resolve() / "ui" / "themes"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _user_theme_root(user_id: str) -> Path:
    # User ids are not path components. Hashing keeps the file tree stable and traversal-proof.
    user_dir = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]
    root = (_themes_root() / user_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _theme_path(user_id: str, theme_id: str) -> Path:
    if not THEME_ID_RE.match(theme_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid theme id.",
        )

    root = _user_theme_root(user_id)
    target = (root / f"{theme_id}.json").resolve()
    if target.parent != root:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Path traversal not allowed.",
        )
    return target


def _serialize_theme(theme: ThemeFile) -> str:
    payload = json.dumps(theme.model_dump(), ensure_ascii=False, indent=2)
    if len(payload.encode("utf-8")) > MAX_THEME_JSON_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Theme file is too large.",
        )
    return payload


def _read_theme_file(path: Path) -> ThemeFile:
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Theme not found.",
        )

    try:
        return ThemeFile.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Failed to read theme file %s", path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid theme file: {exc}",
        )


def _write_theme_file(user_id: str, theme: ThemeFile) -> ThemeFile:
    path = _theme_path(user_id, theme.id)
    payload = _serialize_theme(theme)
    tmp_path = path.with_suffix(".json.tmp")
    tmp_path.write_text(payload, encoding="utf-8")
    tmp_path.replace(path)
    return theme


@router.get("", response_model=list[ThemeSummary])
async def list_themes(user=Depends(get_verified_user)):
    root = _user_theme_root(user.id)
    themes: list[ThemeSummary] = []

    for path in sorted(root.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        try:
            theme = _read_theme_file(path)
            stat = path.stat()
            themes.append(
                ThemeSummary(
                    id=theme.id,
                    name=theme.name,
                    colorMode=theme.colorMode,
                    updatedAt=stat.st_mtime,
                    size=stat.st_size,
                )
            )
        except Exception:
            log.warning("Skipping invalid theme file at %s", path)

    return themes


@router.post("", response_model=ThemeFile)
async def save_theme(form_data: ThemeFile, user=Depends(get_verified_user)):
    return _write_theme_file(user.id, form_data)


@router.post("/import", response_model=ThemeFile)
async def import_theme(form_data: ImportThemeForm, user=Depends(get_verified_user)):
    return _write_theme_file(user.id, form_data.theme)


@router.get("/{theme_id}", response_model=ThemeFile)
async def get_theme(theme_id: str, user=Depends(get_verified_user)):
    return _read_theme_file(_theme_path(user.id, theme_id))


@router.get("/{theme_id}/export")
async def export_theme(theme_id: str, user=Depends(get_verified_user)):
    theme = _read_theme_file(_theme_path(user.id, theme_id))
    return JSONResponse(
        content=theme.model_dump(),
        headers={
            "Content-Disposition": f'attachment; filename="{theme.id}-{int(time.time())}.json"'
        },
    )


@router.delete("/{theme_id}")
async def delete_theme(theme_id: str, user=Depends(get_verified_user)):
    path = _theme_path(user.id, theme_id)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Theme not found.",
        )

    path.unlink()
    return {"ok": True}
