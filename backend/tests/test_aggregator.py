import pytest
from backend.app.aggregator import (
    aggregate_assessment,
    calculate_risk,
    determine_state,
    get_effective_thresholds,
    merge_reasons,
)


def test_standard_threshold_boundaries():
    """Test boundary conditions for standard verified, non-new user (40 caution, 70 restrict)."""
    verified_user = {"is_new": False, "verified": True}

    # At risk 39 -> normal
    assert determine_state(39, "normal", recipient=verified_user, threshold_caution=40, threshold_restrict=70) == "normal"

    # At risk 40 -> caution
    assert determine_state(40, "normal", recipient=verified_user, threshold_caution=40, threshold_restrict=70) == "caution"

    # At risk 69 -> caution
    assert determine_state(69, "normal", recipient=verified_user, threshold_caution=40, threshold_restrict=70) == "caution"

    # At risk 70 -> restricted
    assert determine_state(70, "normal", recipient=verified_user, threshold_caution=40, threshold_restrict=70) == "restricted"


def test_vulnerable_user_threshold_adjustment():
    """Test -10 adjustment when recipient is new or unverified (30 caution, 60 restrict)."""
    new_user = {"is_new": True, "verified": True}
    unverified_user = {"is_new": False, "verified": False}
    new_unverified = {"is_new": True, "verified": False}

    for user in [new_user, unverified_user, new_unverified]:
        caution_th, restrict_th = get_effective_thresholds(user, threshold_caution=40, threshold_restrict=70)
        assert caution_th == 30
        assert restrict_th == 60

        assert determine_state(29, "normal", recipient=user, threshold_caution=40, threshold_restrict=70) == "normal"
        assert determine_state(30, "normal", recipient=user, threshold_caution=40, threshold_restrict=70) == "caution"
        assert determine_state(59, "normal", recipient=user, threshold_caution=40, threshold_restrict=70) == "caution"
        assert determine_state(60, "normal", recipient=user, threshold_caution=40, threshold_restrict=70) == "restricted"


def test_previous_risk_decay():
    """Test 0.85 decay of previous risk when current new_risk is lower."""
    # previous_risk = 80 -> 0.85 * 80 = 68.
    # rule_score = 10, no LLM -> new_risk = 10.
    # final risk = max(10, 68) = 68.
    risk = calculate_risk(rule_score=10, llm_score=None, previous_risk=80)
    assert risk == 68

    # When new_risk is higher than decayed:
    # previous_risk = 40 -> 0.85 * 40 = 34.
    # rule_score = 50 -> new_risk = 50.
    # final risk = max(50, 34) = 50.
    risk_higher = calculate_risk(rule_score=50, llm_score=None, previous_risk=40)
    assert risk_higher == 50


def test_sticky_restricted_state():
    """Once restricted, state never goes back down even if risk drops to 0."""
    user = {"is_new": False, "verified": True}
    state = determine_state(risk=5, previous_state="restricted", recipient=user)
    assert state == "restricted"

    assessment = aggregate_assessment(
        rule_score=0,
        llm_score=0,
        previous_risk=0,
        previous_state="restricted",
        recipient=user,
    )
    assert assessment["state"] == "restricted"


def test_llm_missing_fallback_and_combination():
    """Test fallback when LLM is None vs weighted combination when LLM is present."""
    # When LLM is missing, new_risk = rule_score
    risk_fallback = calculate_risk(rule_score=55, llm_score=None, previous_risk=0)
    assert risk_fallback == 55

    # When LLM is present, new_risk = 0.4 * rule_score + 0.6 * llm_score
    # 0.4 * 50 + 0.6 * 80 = 20 + 48 = 68
    risk_combined = calculate_risk(rule_score=50, llm_score=80, previous_risk=0)
    assert risk_combined == 68


def test_risk_capping_at_100():
    """Ensure risk is clamped at 100 maximum."""
    risk = calculate_risk(rule_score=120, llm_score=150, previous_risk=100)
    assert risk == 100


def test_merge_reasons_dedup_and_cap():
    """Ensure reasons are deduplicated in order and capped at 5."""
    rule_signals = [
        {"label": "suspicious_keyword"},
        {"label": "urgency"},
    ]
    llm_signals = [
        {"label": "suspicious_keyword"},  # duplicate
        {"label": "financial_request"},
        {"label": "gift_card"},
        {"label": "pressure_tactics"},
        {"label": "excess_signal"},
    ]

    reasons = merge_reasons(rule_signals, llm_signals, max_reasons=5)
    assert len(reasons) == 5
    assert reasons == [
        "suspicious_keyword",
        "urgency",
        "financial_request",
        "gift_card",
        "pressure_tactics",
    ]
