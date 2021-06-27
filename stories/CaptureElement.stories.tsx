import React from 'react';
import { Meta, Story } from '@storybook/react';
import { CreeveyMeta, CreeveyStory } from '../src/types';
import { createPortal } from 'react-dom';

export default {
  title: 'ResolveElement',
} as Meta & CreeveyMeta;

const Child = (): JSX.Element => (
  <div
    style={{
      display: 'inline-block',
      backgroundColor: '#85b687',
      margin: '1em',
      width: '400px',
      height: '200px',
      border: '2px solid #477a48',
      borderRadius: '0.5em',
      fontSize: '24px',
    }}
  >
    Child
  </div>
);

export const ChildElement: Story & CreeveyStory = () => <Child />;

export const RootElement: Story & CreeveyStory = () => (
  <>
    <Child />
    <Child />
  </>
);

export const Viewport: Story & CreeveyStory = () => createPortal(<Child />, document.body);
