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


if __name__ == "__main__":
    unittest.main()
