"""Build a heading tree without inventing missing heading levels."""
from html import escape
from html.parser import HTMLParser
import re


class Headings(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag in {'h2', 'h3', 'h4', 'h5', 'h6'}:
            self.current = {'level': int(tag[1]), 'id': dict(attrs).get('id'), 'text': []}

    def handle_data(self, data):
        if self.current is not None:
            self.current['text'].append(data)

    def handle_endtag(self, tag):
        if self.current is not None and tag == 'h' + str(self.current['level']):
            title = re.sub(r'^\d{1,2}[.)]\s+', '', ' '.join(''.join(self.current['text']).split()))
            if title and self.current['id']:
                self.items.append({**self.current, 'title': title, 'children': []})
            self.current = None


def table_of_contents(body):
    parser = Headings()
    parser.feed(body)
    roots, stack = [], []
    for item in parser.items:
        while stack and stack[-1]['level'] >= item['level']:
            stack.pop()
        (stack[-1]['children'] if stack else roots).append(item)
        stack.append(item)

    def render(nodes, prefix=''):
        rows = []
        for index, node in enumerate(nodes, 1):
            number = f'{prefix}.{index}' if prefix else str(index)
            children = render(node['children'], number) if node['children'] else ''
            rows.append(f'<li><a data-toc-link href="#{escape(node["id"], quote=True)}"><span class="toc-number" aria-hidden="true">{number}.</span><span class="toc-title">{escape(node["title"])}</span></a>{children}</li>')
        return '<ol class="toc-list">' + ''.join(rows) + '</ol>'

    return render(roots), len(parser.items)
