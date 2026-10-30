import unittest
from scripts.outline import table_of_contents


class OutlineTests(unittest.TestCase):
    def test_all_levels_nest_without_losing_entries(self):
        body = ''.join(f'<h{level} id="p{level}">단계 {level}</h{level}>' for level in range(2, 7))
        html, count = table_of_contents(body)
        self.assertEqual(count, 5)
        self.assertIn('1.1.1.1.1.', html)
        self.assertEqual(html.count('data-toc-link'), 5)

    def test_skipped_levels_attach_to_nearest_ancestor(self):
        html, count = table_of_contents('<h2 id="a">A</h2><h4 id="b">B</h4><h3 id="c">C</h3><h2 id="d">D</h2>')
        self.assertEqual(count, 4)
        self.assertIn('1.1.', html)
        self.assertIn('1.2.', html)
        self.assertNotIn('1.1.1.', html)
        self.assertIn('>2.</span>', html)

    def test_orphan_deep_heading_has_no_phantom_parents(self):
        html, count = table_of_contents('<h5 id="a">먼저 나온 깊은 절</h5><h6 id="b">하위 절</h6>')
        self.assertEqual(count, 2)
        self.assertEqual(html.count('<li>'), 2)
        self.assertIn('1.1.', html)

    def test_inline_markup_and_entities_produce_plain_labels(self):
        html, _ = table_of_contents('<h4 title="a > b" id="quoted">A &amp; B <code>x</code></h4>')
        self.assertIn('href="#quoted"', html)
        self.assertIn('A &amp; B x', html)
        self.assertNotIn('<code>', html)

    def test_empty_headings_do_not_create_empty_navigation(self):
        html, count = table_of_contents('<h2 id="empty"></h2><h4 id="real">제목</h4>')
        self.assertEqual(count, 1)
        self.assertNotIn('#empty', html)

    def test_document_without_headings_is_supported(self):
        html, count = table_of_contents('<p>본문만 있습니다.</p>')
        self.assertEqual(count, 0)
        self.assertEqual(html, '<ol class="toc-list"></ol>')


if __name__ == '__main__':
    unittest.main()
