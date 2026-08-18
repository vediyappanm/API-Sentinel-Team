from server.modules.ingestion.traffic_sample import persistable_body
from server.modules.utils.redactor import Redactor


def test_persistable_body_redacts_secrets_and_caps_length():
    text = persistable_body('{"password":"raw-secret","ok":true}')
    assert text is not None
    assert "raw-secret" not in text
    assert Redactor.REDACT_VALUE in text

    huge = "x" * 20_000
    capped = persistable_body(huge)
    assert capped is not None
    assert len(capped) == 8192


def test_persistable_body_empty_is_none():
    assert persistable_body(None) is None
    assert persistable_body("") is None
    assert persistable_body("   ") is None


def test_persistable_identity_drops_placeholders():
    from server.modules.ingestion.traffic_sample import persistable_identity

    assert persistable_identity("user-42") == "user-42"
    assert persistable_identity("unknown") is None
    assert persistable_identity("anonymous") is None
    assert persistable_identity("") is None
