import React from 'react';
import { useSeo } from '../seo/useSeo.js';
import { useHeaderTone } from '../components/shell/HeaderTone.jsx';
import Hero from './home/Hero.jsx';
import GoalNavigator from './home/GoalNavigator.jsx';
import SavingsShelf from './home/SavingsShelf.jsx';
import BrandWall from './home/BrandWall.jsx';
import KindTiles from './home/KindTiles.jsx';
import PartnerStory from './home/PartnerStory.jsx';
import Journal from './home/Journal.jsx';
import TelegramBlock from './home/TelegramBlock.jsx';
import Reviews from './home/Reviews.jsx';
import { useHomeFacts } from './home/useHomeFacts.js';

/** fairhaven.uz home: the stage hero with the orbit, then the floor and stage sections in turn. */
export default function Home() {
  useSeo();
  useHeaderTone('stage');
  const { home } = useHomeFacts();
  return (
    <>
      <Hero />
      <GoalNavigator />
      <SavingsShelf />
      <BrandWall />
      <KindTiles />
      <PartnerStory />
      <Journal />
      <TelegramBlock />
      <Reviews items={home.reviews} />
    </>
  );
}
