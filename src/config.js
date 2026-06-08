export const USERS = {
  A: {
    name:       import.meta.env.VITE_USER_A_NAME,
    initials:   import.meta.env.VITE_USER_A_NAME,
    password:   import.meta.env.VITE_USER_A_PASSWORD,
    dbKey:      import.meta.env.VITE_USER_A_DBKEY,
    imgFolder:  'P',
    imgCount:   Number(import.meta.env.VITE_USER_A_IMGCOUNT) || 1,
  },
  B: {
    name:       import.meta.env.VITE_USER_B_NAME,
    initials:   import.meta.env.VITE_USER_B_NAME,
    password:   import.meta.env.VITE_USER_B_PASSWORD,
    dbKey:      import.meta.env.VITE_USER_B_DBKEY,
    imgFolder:  'M',
    imgCount:   Number(import.meta.env.VITE_USER_B_IMGCOUNT) || 1,
  },
};

export const USER_A = USERS.A;
export const USER_B = USERS.B;

export function getMyConfig(currentUserKey) {
  return USERS[currentUserKey];
}
export function getFriendConfig(currentUserKey) {
  return currentUserKey === 'A' ? USERS.B : USERS.A;
}

export const FIXED_CATS = [
  { id: 'idea',    label: 'Ý tưởng' },
  { id: 'erd',     label: 'Database' },
  { id: 'uc_gen',  label: 'Use case tổng quát' },
  { id: 'uc_det',  label: 'Use case chi tiết' },
  { id: 'seq',     label: 'Sequence diagram' },
  { id: 'act',     label: 'Activity diagram' },
  { id: 'ui',      label: 'Thiết kế giao diện' },
  { id: 'backend', label: 'Code backend' },
  { id: 'deploy',  label: 'Deploy lên web' },
  { id: 'report',  label: 'Viết báo cáo' },
];

export const CAT_LABEL = Object.fromEntries(FIXED_CATS.map(c => [c.id, c.label]));
