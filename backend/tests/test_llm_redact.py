from backend.llm.redact import redact_text, redact_window


def test_redacts_email():
    result = redact_text("Email me at arun@gmail.com")
    assert "[EMAIL]" in result
    assert "arun@gmail.com" not in result


def test_redacts_international_phone_with_spaces():
    result = redact_text("Call me at +91 98765 43210")
    assert "[PHONE]" in result
    assert "98765 43210" not in result


def test_redacts_phone_with_punctuation():
    result = redact_text("My number is +1 (415) 555-2671")
    assert "[PHONE]" in result
    assert "555-2671" not in result


def test_redacts_url():
    result = redact_text("Visit https://example.com/profile")
    assert "[URL]" in result
    assert "example.com" not in result


def test_redacts_social_handle():
    result = redact_text("Message @sample_user please")
    assert "[HANDLE]" in result
    assert "@sample_user" not in result


def test_redacts_known_name_case_insensitively():
    result = redact_text(
        "Alice spoke to ALICE today",
        names={"Alice": "SENDER_A"},
    )
    assert result == "SENDER_A spoke to SENDER_A today"


def test_redacts_window_without_mutating_original():
    original = [
        {"sender_id": 12, "text": "Hi, email a@gmail.com"},
        {"sender_id": 34, "text": "Hello, call +91 98765 43210"},
    ]

    result = redact_window(original)

    assert result[0]["sender_id"] == "SENDER_A"
    assert result[1]["sender_id"] == "SENDER_B"
    assert "[EMAIL]" in result[0]["text"]
    assert "[PHONE]" in result[1]["text"]
    assert original[0]["sender_id"] == 12
    assert original[1]["sender_id"] == 34


def test_empty_text_is_safe():
    assert redact_text("") == ""
