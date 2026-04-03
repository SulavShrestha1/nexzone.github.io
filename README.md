# NexZone — Sports & Anime Hub 🏀⚽🎌

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://sulavshrestha1.github.io)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Enabled-orange)](https://sulavshrestha1.github.io)

Your #1 source for live sports scores, NBA, EPL, NFL, and top anime news, reviews, and rankings updated daily.

## ✨ Features

### 📊 Live Sports Coverage
- **Real-time NBA & EPL scores** powered by ESPN API
- **Live game tracking** with team records, venue info, broadcast details
- **Breaking news ticker** with instant headlines
- **Detailed game pages** with stat leaders, injuries, and insights

### 🎌 Anime Database
- **Top airing anime** from MyAnimeList via Jikan API
- **Genre filtering** and advanced search
- **Detailed anime pages** with episodes, streaming info, and rankings
- **AniList integration** for episode counts and airing schedules

### 📰 Editorial Content
- **Quality articles** on sports and anime
- **Category filtering** (Sports, Anime, Reviews)
- **Rich article pages** with images and external links
- **Related content recommendations**

### 🎨 Modern UI/UX
- **Dark theme** with red accent gradients
- **Tailwind CSS** for responsive, beautiful design
- **Smooth animations** and page transitions
- **Mobile-first responsive** design
- **PWA enabled** for offline support

### 💰 Monetization Ready
- **AdSense placeholders** in optimal placements
- **Leaderboard, rectangle, in-article ads**
- **Beautiful ad cards** with gradient backgrounds
- **High-engagement positions** marked with badges

## 🚀 Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Tailwind CSS (CDN) + Custom CSS
- **APIs**: ESPN, Jikan (MyAnimeList), AniList GraphQL
- **PWA**: Service Worker with offline caching
- **Hosting**: GitHub Pages

## 📁 Project Structure

```
nexzone/
├── index.html          # Main HTML with all pages
├── manifest.json       # PWA manifest
├── sw.js              # Service Worker
├── css/
│   └── nexzone.css    # Custom styles (merged with Tailwind)
├── js/
│   ├── app.js         # Main app logic, routing, UI
│   ├── api.js         # API helpers (ESPN, Jikan, AniList)
│   └── articles.js    # Static article data
└── README.md
```

## 🎯 Recent Improvements (2026)

### UI/UX Enhancements
✅ **Tailwind CSS Integration** - Modern, utility-first styling
✅ **Smooth Page Transitions** - Fade animations between pages
✅ **Enhanced Score Cards** - Team records, venue, broadcast info
✅ **Better Ad Placements** - Gradient cards with badges
✅ **Micro-animations** - Hover effects, transitions throughout
✅ **Improved Pagination** - Better styled page navigation
✅ **Responsive Design** - Mobile-optimized with breakpoints

### Performance & SEO
✅ **Service Worker** - Offline caching and PWA support
✅ **PWA Manifest** - Installable on mobile devices
✅ **Structured Data** - JSON-LD for search engines
✅ **Meta Tags** - Open Graph, Twitter Cards
✅ **Google Analytics Ready** - Placeholder for tracking

### Data Enrichment
✅ **Team Records** - Win/loss records on score cards
✅ **Venue Information** - Location and attendance data
✅ **Broadcast Details** - TV/streaming info when available
✅ **Enhanced Game Pages** - More context and statistics

## 🛠️ Setup & Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/sulavshrestha1/sulavshrestha1.github.io.git
   cd sulavshrestha1.github.io
   ```

2. **Open in browser**
   - Simply open `index.html` in any modern browser
   - Or use a local server: `python -m http.server 8000`

3. **Customize**
   - Add your Google AdSense code in `index.html`
   - Update Google Analytics ID (search for `GA_MEASUREMENT_ID`)
   - Modify articles in `js/articles.js`

## 📈 Adding Content

### New Articles
Edit `js/articles.js` and add a new object to the `ARTICLES` array:

```javascript
{
  id: 'unique-id',
  cat: 'sports', // or 'anime', 'review'
  tagCls: 'ts', // ts=red, ta=gold, tr=blue
  tag: 'NBA',
  emoji: '🏀',
  title: 'Your Article Title',
  excerpt: 'Short description',
  date: 'Today',
  views: '1.2k',
  author: 'Author Name',
  readTime: '5 min read',
  coverImage: 'https://image-url.jpg',
  externalReadUrl: 'https://external-link.com',
  content: '<p>HTML content here...</p>'
}
```

### AdSense Integration
Replace the placeholder ad slots in `index.html` with your actual AdSense code:

```html
<div class="ad-slot lb">
  <!-- Your AdSense code here -->
</div>
```

## 🔌 API Sources

- **ESPN API**: Live scores, game details, news headlines
- **Jikan API**: MyAnimeList data, anime metadata
- **AniList GraphQL**: Episode counts, streaming info, HD art
- **Google Apps Script**: Newsletter subscription backend

## 📱 PWA Features

- **Offline Support**: Cached assets work without internet
- **Installable**: Add to home screen on mobile
- **Fast Loading**: Service Worker caches resources
- **Background Sync**: Updates when connection restored

## 🎨 Design System

### Colors
- Background: `#0a0a0c`
- Surface: `#111118`
- Card: `#16161f`
- Red Accent: `#e8323c`
- Gold: `#f5a623`
- Green: `#50c878`

### Typography
- Headings: Bebas Neue
- Body: Outfit (300-800 weights)

### Components
- Cards with hover lift effects
- Gradient backgrounds
- Smooth transitions (0.2-0.4s)
- Box shadows for depth

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

## 📄 License

[MIT](LICENSE)

## 📧 Contact

Have a story tip or feedback? [Get in touch →](https://sulavshrestha1.github.io/#contact)

---

**Built with ❤️ for sports and anime fans**

*Data updates every 90 seconds from live APIs*