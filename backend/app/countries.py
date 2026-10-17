"""Supported countries for TRB registration (East African Community members).

The country code is validated server-side against this list. Flags are derived
from the ISO 3166-1 alpha-2 code so they stay consistent between backend and
frontend without hardcoding emoji in multiple places.
"""
from enum import Enum
from typing import List


class Country(str, Enum):
    RW = "RW"  # Rwanda
    BI = "BI"  # Burundi
    UG = "UG"  # Uganda
    TZ = "TZ"  # Tanzania
    KE = "KE"  # Kenya


COUNTRY_NAMES = {
    Country.RW: "Rwanda",
    Country.BI: "Burundi",
    Country.UG: "Uganda",
    Country.TZ: "Tanzania",
    Country.KE: "Kenya",
}


def flag_for(code: str) -> str:
    """Return the regional-indicator emoji flag for an ISO alpha-2 code."""
    code = (code or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + (ord(c) - ord("A"))) for c in code)


def country_list() -> List[dict]:
    return [
        {"code": c.value, "name": COUNTRY_NAMES[c], "flag": flag_for(c.value)}
        for c in Country
    ]
