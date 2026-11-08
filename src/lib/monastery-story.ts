import type { MonasteryProgress } from './monastery';

export const THREE_JEWELS = [
  { name: 'Buddha', subtitle: 'The awakened teacher', text: 'Buddha means “awakened one.” These stories remember Siddhartha Gautama, also called Shakyamuni, whose example points toward awakening. The statues are reminders of that example and a focus for reflection.' },
  { name: 'Dharma', subtitle: 'The teachings and the path', text: 'The Dharma is the Buddha’s teaching and the path of practice: wisdom, ethical conduct, and the cultivation of the mind. A repaired teaching hall or quiet garden gives people a place to study and practise.' },
  { name: 'Sangha', subtitle: 'The community of practice', text: 'Sangha has several related meanings in Buddhism, including the monastic community and the community of awakened disciples. In wider usage it can also mean a community of practitioners. These villages celebrate the fourfold community: monks, nuns, lay women, and lay men, supporting one another through generosity, learning, and practice.' },
] as const;
export const MONASTERY_SITES = [
  {
    id: 'theravada', name: 'Bodhi Light Vihara', tradition: 'Sri Lankan Theravada', region: 'A warm island hillside', row: 0, start: 0, end: 10,
    palette: '#e8c77b', architecture: 'Ivory plaster, terracotta roofs, a Bodhi tree, and a rounded dagaba with a golden finial.',
    statue: 'A stone Shakyamuni Buddha seated in meditation, with the hands resting in the lap.',
    context: 'Theravada traditions place strong emphasis on the Pali teachings and monastic practice. The Bodhi tree recalls the Buddha’s awakening; a stupa or dagaba is a place of remembrance and devotion.',
    story: [
      'Caretaker Anika arrives at a neglected island vihara. The resident community asks for help reopening its courtyard and Bodhi garden. Their first lesson is simple: every small repair can support a place of practice.',
      'Stone by stone, the courtyard becomes welcoming again. Beside the seated Buddha, Anika makes room for quiet reflection. Under the Bodhi tree, the community prepares to share the Dharma with visitors.',
      'The courtyard and garden are ready. The Sangha gathers for study and practice, and Anika receives a letter from Lotus Wisdom Temple: another community needs a helping hand.',
    ],
  },
  {
    id: 'mahayana', name: 'Lotus Wisdom Temple', tradition: 'Chinese Mahayana', region: 'A lantern-lit valley', row: 1, start: 10, end: 30,
    palette: '#a6d8bf', architecture: 'Red timber halls, jade glazed tiles, sweeping eaves, lantern walks, a reflecting pond, and a carved gate.',
    statue: 'A gilded Shakyamuni Buddha on a lotus pedestal in the temple’s shrine.',
    context: 'Mahayana traditions emphasize wisdom and compassion, including the bodhisattva ideal of working for the awakening of all beings. Chinese Buddhist communities include several schools, with varied practices and temple styles.',
    story: [
      'At Lotus Wisdom Temple, Anika finds a dark lantern walk and a teaching hall closed by years of wear. The community hopes to welcome neighbours again. Repairing the path will be their first act of hospitality.',
      'Light returns to the lanterns and the pond grows still. In the Dharma Hall, the restored Buddha shrine reminds visitors of the teacher; the open doors make space for teachings on wisdom and compassion.',
      'The temple is alive with shared study and kindness. Its community thanks Anika, then sends tools and encouragement toward a mountain monastery where winter has damaged the roofs.',
    ],
  },
  {
    id: 'vajrayana', name: 'Snow Lion Sanctuary', tradition: 'Tibetan Vajrayana', region: 'A high mountain pass', row: 2, start: 30, end: 40,
    palette: '#f0bc8e', architecture: 'White walls, red ochre bands, gilded roof details, prayer flags, and a golden stupa against the mountains.',
    statue: 'A gilded Shakyamuni Buddha in the earth-touching gesture, recalling the Buddha’s awakening.',
    context: 'Tibetan Buddhist traditions practise Mahayana and Vajrayana teachings. Monastic study, compassion, meditation, and lineage are central. Tibetan Buddhism contains several schools; this fictional sanctuary draws broadly from Tibetan architecture.',
    story: [
      'Snow and wind have worn the sanctuary roof. Anika joins the caretakers as they secure the beams and protect the shared spaces. Here too, the Three Jewels guide the work: teacher, teachings, and community.',
      'The golden finial shines again. Near the earth-touching Buddha, the caretakers explain how the image recalls awakening. The repaired stupa terrace gives the community a safe place for remembrance and reflection.',
      'The sanctuary is sheltered once more. Its Sangha returns to study and meditation. Anika’s final invitation comes from Still Water Monastery, where a quiet garden is waiting to be cared for.',
    ],
  },
  {
    id: 'zen', name: 'Still Water Monastery', tradition: 'Japanese Zen', region: 'A quiet wooded valley', row: 3, start: 40, end: 50,
    palette: '#c6d3b3', architecture: 'Restrained timber halls, dark gray tile roofs, moss, raked gravel, carefully placed stones, pine, and maple.',
    statue: 'A dark bronze Shakyamuni Buddha seated in meditation in a simple shrine.',
    context: 'Zen is a family of Mahayana traditions, not a separate fourth branch at the same level as Mahayana. Japanese Zen communities include schools such as Soto and Rinzai. Meditation and attention in everyday activity are important; styles and practices vary.',
    story: [
      'Anika reaches a weathered timber hall. The caretakers begin with ordinary work: cleaning a floor, tending a garden, preparing a seat. Their story connects care in daily activity with Buddhist practice.',
      'The bronze Buddha shrine is clean, and the garden is carefully tended. The meditation hall is ready for people to sit, learn, and practise together. The Dharma is supported by both quiet spaces and everyday care.',
      'All four monasteries are restored. Communities from the journey send their thanks. Anika’s journal closes with the same Three Jewels that began it: Buddha, Dharma, and Sangha—shared foundations expressed through different living traditions.',
    ],
  },
] as const;
export type MonasterySite = typeof MONASTERY_SITES[number];
export function activeMonastery(progress: MonasteryProgress) { return MONASTERY_SITES.find(site => progress.completedTasks < site.end) ?? MONASTERY_SITES[3]; }
export function siteRepairs(site: MonasterySite, completedTasks: number) { return Math.max(0, Math.min(site.end - site.start, completedTasks - site.start)); }
