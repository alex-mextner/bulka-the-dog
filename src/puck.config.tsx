import type { Config } from '@puckeditor/core';
import BulkaSection from '../client/pages/Index';
import { PageFrame } from '../client/cms/PageFrame';
import type { BulkaComponents, BulkaRootFields } from '../client/cms/types';
import {
  RootDefinition, HeroDefinition, AppearanceDefinition, HabitsDefinition,
  SkillsDefinition, HealthDefinition, ConditionsDefinition, QuestionsDefinition,
  GameDefinition, ContactDefinition, PhotoGalleryDefinition,
} from './puck.definitions';

// Keep named components and literal definitions statically readable. Conloca
// publishes this field vocabulary separately from the executable editor bundle.
const config: Config<BulkaComponents, BulkaRootFields> = {
  categories: { sections: { title: 'Bulka sections', components: [
    'Hero', 'Appearance', 'Habits', 'Skills', 'Health', 'Conditions', 'Questions', 'Contact', 'PhotoGallery',
  ] }, optional: { title: 'Optional features', components: ['Game'] } },
  root: {
    ...RootDefinition,
    render: ({ children, ...props }) => <PageFrame {...props}>{children}</PageFrame>,
  },
  components: {
    Hero: { ...HeroDefinition, render: props => <BulkaSection section="hero" content={props} /> },
    Appearance: { ...AppearanceDefinition, render: props => <BulkaSection section="appearance" content={props} /> },
    Habits: { ...HabitsDefinition, render: props => <BulkaSection section="habits" content={props} /> },
    Skills: { ...SkillsDefinition, render: props => <BulkaSection section="skills" content={props} /> },
    Health: { ...HealthDefinition, render: props => <BulkaSection section="health" content={props} /> },
    Conditions: { ...ConditionsDefinition, render: props => <BulkaSection section="conditions" content={props} /> },
    Questions: { ...QuestionsDefinition, render: props => <BulkaSection section="faq" content={props} /> },
    Game: { ...GameDefinition, render: props => <BulkaSection section="game" content={props} /> },
    Contact: { ...ContactDefinition, render: props => <BulkaSection section="contact" content={props} /> },
    PhotoGallery: { ...PhotoGalleryDefinition, render: props => <BulkaSection section="gallery" content={props} /> },
  },
};

export default config;
