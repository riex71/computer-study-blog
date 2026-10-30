"""Hand-chosen scalar coefficients, not a trained Mamba benchmark.

Run with Python 3, no external packages: python3 state_recurrence.py
"""
from math import isclose


def trace(inputs, coefficients):
    if len(inputs) != len(coefficients):
        raise ValueError('Provide one coefficient pair per input')
    state = 0.0
    states = []
    for x, (a, b) in zip(inputs, coefficients):
        state = a * state + b * x
        states.append(state)
    return states


def compose(later, earlier):
    """Return later(earlier(h)) for affine transforms (a, b)."""
    a2, b2 = later
    a1, b1 = earlier
    return a2 * a1, a2 * b1 + b2


def prefix_states(inputs, coefficients):
    accumulated = (1.0, 0.0)
    states = []
    for x, (a, b) in zip(inputs, coefficients):
        accumulated = compose((a, b * x), accumulated)
        states.append(accumulated[1])  # initial state h_0 = 0
    return states


if __name__ == '__main__':
    inputs = [2, 9, 0, 3]
    fixed = [(0.5, 1.0)] * 4
    selected = [(0.5, 1.0), (1.0, 0.0), (0.5, 1.0), (0.5, 1.0)]
    assert trace(inputs, fixed) == [2.0, 10.0, 5.0, 5.5]
    assert trace(inputs, selected) == [2.0, 2.0, 1.0, 3.5]
    for coefficients in [fixed, selected]:
        sequential = trace(inputs, coefficients)
        composed = prefix_states(inputs, coefficients)
        assert all(isclose(a, b) for a, b in zip(sequential, composed))
        print(sequential)
    x, y, z = (0.5, 2.0), (1.0, 0.0), (0.5, 3.0)
    assert compose(z, compose(y, x)) == compose(compose(z, y), x)
    print('Sequential updates and affine composition agree.')
