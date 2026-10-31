import unittest
from scripts.admin_entry import admin_entry, draft_migration


class AdminEntryTests(unittest.TestCase):
    def test_verified_host_has_only_a_link_and_no_public_editing_controls(self):
        html = admin_entry('https://studybase-admin.my-account.workers.dev')
        self.assertIn('https://studybase-admin.my-account.workers.dev/write.html', html)
        self.assertNotIn('<textarea', html)
        self.assertNotIn('writer.mjs', html)
        self.assertNotIn('github-token', html)

    def test_draft_transfer_uses_only_the_fixed_admin_origin_and_starts_locked(self):
        html = draft_migration('https://studybase-admin.my-account.workers.dev')
        self.assertIn('data-admin-origin="https://studybase-admin.my-account.workers.dev"', html)
        self.assertIn('id="transfer-drafts"', html)
        self.assertIn('disabled', html)
        self.assertNotIn('<textarea', html)

    def test_address_must_be_an_exact_workers_origin(self):
        for url in ['http://studybase-admin.account.workers.dev', 'https://evil.test', 'https://studybase-admin.account.workers.dev/other', 'https://studybase-admin.account.workers.dev?x=1', 'https://studybase-admin.account.workers.dev#x', 'https://owner@studybase-admin.account.workers.dev', 'https://studybase-admin.account.workers.dev.evil.test']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                admin_entry(url)


if __name__ == '__main__':
    unittest.main()
