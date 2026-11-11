import type {BGDesign} from '@/lib/backgammon-sets';

export function BoardEmblem({motif}:{motif:BGDesign['motif']}){const paths:Record<BGDesign['motif'],string>={classic:'M-5 0h10M0-5v10',compass:'M0-8 3-2 8 0 3 2 0 8-3 2-8 0-3-2Z',lotus:'M0 7Q-11 1-7-5Q-2-4 0 2Q2-4 7-5Q11 1 0 7ZM0 3Q-5-3 0-9Q5-3 0 3Z',stars:'M0-9 2-3 8-3 3 1 5 8 0 4-5 8-3 1-8-3-2-3Z',crown:'M-8-5-4 1 0-7 4 1 8-5 6 6H-6ZM-5 9H5',wave:'M-9-3Q-4-9 0-3T9-3M-9 3Q-4-3 0 3T9 3',scarab:'M0-8V8M-6-5Q0-11 6-5L8 2 4 8H-4L-8 2ZM-8 0-12-5M8 0 12-5',bamboo:'M-3-9V9M-6-3H0M-6 3H0M2 5V-5Q8-8 8-2Q2-1 2-5',sun:'M0-12V-9M0 9V12M-12 0H-9M9 0H12M-8-8-6-6M6 6 8 8M-8 8-6 6M6-6 8-8M6 0A6 6 0 1 1-6 0A6 6 0 1 1 6 0',moon:'M4-9A10 10 0 1 0 7 7A9 9 0 0 1 4-9Z',flame:'M0 10Q-11 7-7-1L-3 2Q-4-5 2-11Q2-4 7 0Q12 7 0 10ZM0 8Q-5 5 0 1Q5 5 0 8Z',
peak:'M-11 8 0-10 11 8ZM-4-3 0 1 4-3',rose:'M0 8C-13 5-12-5-5-4C-7-12 7-12 5-4C12-5 13 5 0 8ZM-4 0Q0-5 4 0Q0 6-4 0Z',
shell:'M0 9Q-13 4-10-4Q-9-10-5-7Q0-13 5-7Q9-10 10-4Q13 4 0 9ZM0 9-5-7M0 9V-9M0 9 5-7',
snow:'M0-11V11M-10-6 10 6M-10 6 10-6M-3-8 0-5 3-8M-3 8 0 5 3 8',
anchor:'M0-7V9M-5-3H5M-9 2Q-7 9 0 9T9 2M0-7a2 2 0 1 0 0-4 2 2 0 1 0 0 4',
leaf:'M0 10V3L-9 1-7-2-9-7-4-5 0-10 4-5 9-7 7-2 9 1 0 3Z',
feather:'M-8 10 6-7M-5 6Q-8-7 9-10Q11 6-5 6ZM0 0 0-5M3-3 7-3',
hourglass:'M-8-10H8M-8 10H8M-6-9Q-6-4 0 0Q6 4 6 9M6-9Q6-4 0 0Q-6 4-6 9M-4 7 0 4 4 7',
gate:'M-9 9V-4H-6V-9H-2V-5H2V-9H6V-4H9V9ZM-3 9V3Q0-2 3 3V9',knot:'M0-9Q12-4 0 9Q-12-4 0-9M-9 4Q-3-9 9 4Q0 13-9 4Z'};return <path d={paths[motif]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>;}
