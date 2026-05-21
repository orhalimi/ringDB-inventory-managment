const SPHERE_COLORS = {
  leadership: '#b07fd4',
  tactics:    '#e07070',
  spirit:     '#70a0e0',
  lore:       '#70bb70',
  neutral:    '#a09888',
  baggins:    '#e8c86a',
  fellowship: '#c8a060',
};

const SPHERE_ABBREV = {
  leadership: 'L',
  tactics:    'T',
  spirit:     'S',
  lore:       'Lo',
  neutral:    'N',
  baggins:    'Ba',
  fellowship: 'Fe',
};

export function sphereColor(code) {
  return SPHERE_COLORS[code] ?? '#e8e0d0';
}

export function formatSphere(code) {
  return SPHERE_ABBREV[code] ?? code ?? '';
}
