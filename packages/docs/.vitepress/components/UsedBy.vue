<script setup lang="ts">
// The projects shown on the home page (EN and ES), as a marquee. The logos
// live in public/users/ (black, plus a `-white` copy the root README uses in
// dark mode), so the root README reads the same files.
const users = [
  { name: 'Expo', logo: 'expo', url: 'https://expo.dev' },
  { name: 'Mastra', logo: 'mastra', url: 'https://mastra.ai' },
  { name: 'Skyward', logo: 'skyward', url: 'https://skyward.ai' },
  { name: 'Univer', logo: 'univer', url: 'https://univer.ai' },
  { name: 'The Blue Alliance', logo: 'the-blue-alliance', url: 'https://www.thebluealliance.com' },
  { name: 'RetroAchievements', logo: 'retroachievements', url: 'https://retroachievements.org' },
  { name: 'Tamery', logo: 'tamery', url: 'https://tamery.app' },
  { name: 'Stella', logo: 'stella', url: 'https://stll.app' },
]
</script>

<template>
  <div class="used-by">
    <!-- Two copies, so the track loops without a gap; the second is for the eye only. -->
    <div class="track">
      <ul v-for="copy in 2" :key="copy" :aria-hidden="copy === 2 ? 'true' : undefined">
        <li v-for="u in users" :key="u.logo">
          <a
            :href="u.url"
            :title="u.name"
            :tabindex="copy === 2 ? -1 : undefined"
            target="_blank"
            rel="noreferrer"
          >
            <img :src="`/users/${u.logo}.svg`" :alt="copy === 1 ? u.name : ''" loading="lazy" />
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.used-by {
  overflow: hidden;
  margin: 32px 0;
  mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
}
.track {
  display: flex;
  width: max-content;
  animation: marquee 40s linear infinite;
}
.used-by:hover .track {
  animation-play-state: paused;
}
ul {
  display: flex;
  align-items: center;
  gap: 56px;
  margin: 0;
  padding: 0 28px;
  list-style: none;
}
li {
  margin: 0;
}
a {
  display: block;
  opacity: 0.55;
  transition: opacity 0.2s;
}
a:hover {
  opacity: 1;
}
img {
  display: block;
  height: 28px;
  width: auto;
  max-width: none;
}
.dark img {
  filter: invert(1);
}
@keyframes marquee {
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .used-by {
    mask-image: none;
  }
  .track {
    animation: none;
    width: auto;
  }
  ul {
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 24px;
  }
  ul[aria-hidden] {
    display: none;
  }
}
</style>
