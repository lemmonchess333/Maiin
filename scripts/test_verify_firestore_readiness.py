import copy
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).with_name("verify-firestore-readiness.py")
module_spec = importlib.util.spec_from_file_location("readiness", path)
readiness = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(readiness)


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.spec = {
            "indexes": [{"collectionGroup": "requests", "queryScope": "COLLECTION",
                         "fields": [{"fieldPath": "status", "order": "ASCENDING"},
                                    {"fieldPath": "due", "order": "ASCENDING"}]}],
            "fieldOverrides": [
                {"collectionGroup": "requests", "fieldPath": "expiresAt", "ttl": True, "indexes": []},
                {"collectionGroup": "items", "fieldPath": "authorId", "indexes": [
                    {"queryScope": "COLLECTION_GROUP", "order": "ASCENDING"}]}]}
        self.indexes = [{**copy.deepcopy(self.spec["indexes"][0]),
                         "name": "projects/p/databases/d/collectionGroups/requests/indexes/1", "state": "READY"}]
        self.indexes[0]["fields"].append({"fieldPath": "__name__", "order": "ASCENDING"})
        self.fields = [
            {"name": "projects/p/databases/d/collectionGroups/requests/fields/expiresAt",
             "ttlConfig": {"state": "ACTIVE"}, "indexConfig": {"indexes": []}},
            {"name": "projects/p/databases/d/collectionGroups/items/fields/authorId", "indexConfig": {"indexes": [
                {"queryScope": "COLLECTION_GROUP", "state": "READY",
                 "fields": [{"fieldPath": "authorId", "order": "ASCENDING"}]}]}}]

    def pending(self):
        return readiness.pending_resources(self.spec, self.indexes, self.fields)

    def test_ready_accepts_api_name_tiebreaker(self):
        self.assertEqual(self.pending(), [])

    def test_missing_or_building_composite_blocks(self):
        self.indexes[0]["state"] = "CREATING"
        self.assertTrue(self.pending())
        self.indexes.clear()
        self.assertTrue(self.pending())

    def test_wrong_field_order_does_not_match(self):
        self.indexes[0]["fields"].reverse()
        self.assertTrue(self.pending())

    def test_ttl_must_be_active_and_match_retention(self):
        self.fields[0]["ttlConfig"]["state"] = "CREATING"
        self.assertTrue(self.pending())
        self.fields[0]["ttlConfig"] = {"state": "ACTIVE", "expirationOffset": "86400s"}
        with self.assertRaisesRegex(RuntimeError, "expiration offset"):
            self.pending()

    def test_collection_group_index_cannot_be_replaced_by_collection(self):
        self.fields[1]["indexConfig"]["indexes"][0]["queryScope"] = "COLLECTION"
        self.assertTrue(self.pending())

    def test_field_index_build_and_exemption_are_checked(self):
        self.fields[1]["indexConfig"]["indexes"][0]["state"] = "CREATING"
        self.assertTrue(self.pending())
        self.fields[1]["indexConfig"]["indexes"][0]["state"] = "READY"
        self.fields[0]["indexConfig"]["usesAncestorConfig"] = True
        self.assertTrue(self.pending())

    def test_repair_fails_immediately(self):
        for target in [self.indexes[0], self.fields[0]["ttlConfig"], self.fields[1]["indexConfig"]["indexes"][0]]:
            target["state"] = "NEEDS_REPAIR"
            with self.assertRaisesRegex(RuntimeError, "needs repair"):
                self.pending()
            target["state"] = "ACTIVE" if target is self.fields[0]["ttlConfig"] else "READY"

    def test_pagination_preserves_filter(self):
        from io import BytesIO
        with patch.object(readiness.urllib.request, "urlopen", side_effect=[
            BytesIO(b'{"fields":[{"name":"one"}],"nextPageToken":"next/page"}'),
            BytesIO(b'{"fields":[{"name":"two"}]}')]) as get:
            self.assertEqual(readiness.list_resources("fields", "test-token", filter="ttlConfig:*"),
                             [{"name": "one"}, {"name": "two"}])
            query = readiness.urllib.parse.parse_qs(readiness.urllib.parse.urlparse(get.call_args.args[0].full_url).query)
            self.assertEqual(query, {"filter": ["ttlConfig:*"], "pageToken": ["next/page"]})


class PollTests(unittest.TestCase):
    """The wait for index builds polls for up to an hour; one poll Google
    does not answer must not fail the release."""

    def run_verify(self, answers):
        lists = iter(answers)

        def list_resources(kind, token, **params):
            answer = next(lists)
            if isinstance(answer, BaseException):
                raise answer
            return answer

        clock = iter(range(0, 100_000, 30))
        with patch.object(readiness, "list_resources", side_effect=list_resources), \
                patch.object(readiness, "pending_resources", return_value=[]), \
                patch.object(readiness.subprocess, "check_output", return_value="test-token\n"), \
                patch.object(readiness.time, "monotonic", side_effect=lambda: next(clock)), \
                patch.object(readiness.time, "sleep") as sleep, \
                patch("builtins.print"):
            readiness.verify()
        return sleep

    def test_a_poll_google_does_not_answer_is_tried_again(self):
        for failure in [readiness.urllib.error.URLError("timed out"), TimeoutError(), ConnectionResetError()]:
            sleep = self.run_verify([failure, [], []])
            sleep.assert_called_once_with(30)

    def test_a_poll_answered_with_429_or_a_5xx_is_tried_again(self):
        for code in [408, 429, 500, 503]:
            error = readiness.urllib.error.HTTPError("https://example.invalid", code, "busy", {}, None)
            sleep = self.run_verify([[], error, [], []])
            sleep.assert_called_once_with(30)

    def test_a_refusal_fails_at_once(self):
        for code in [401, 403, 404]:
            error = readiness.urllib.error.HTTPError("https://example.invalid", code, "no", {}, None)
            with self.assertRaises(readiness.urllib.error.HTTPError):
                self.run_verify([error, [], []])

    def test_google_not_answering_until_the_deadline_still_fails(self):
        error = readiness.urllib.error.URLError("timed out")
        with self.assertRaisesRegex(RuntimeError, "timed out: Google gave no answer"):
            self.run_verify([error] * 1000)


if __name__ == "__main__":
    unittest.main()
