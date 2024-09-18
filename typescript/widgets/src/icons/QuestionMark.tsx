import React, { memo } from 'react';

import { ColorPalette } from '../color.js';

import { DefaultIconProps } from './types.js';

function _QuestionMarkIcon({ color, ...rest }: DefaultIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="13.7 6 20.65 38" {...rest}>
      <path
        d="M21.55 31.5q.05-3.6.82-5.25.78-1.65 2.93-3.6 2.1-1.9 3.23-3.52t1.12-3.48q0-2.25-1.5-3.75t-4.2-1.5q-2.6 0-4 1.48t-2.05 3.07l-4.2-1.85q1.1-2.95 3.73-5.03T23.95 6q5 0 7.7 2.77t2.7 6.68q0 2.4-1.02 4.35-1.03 1.95-3.28 4.1-2.45 2.35-2.95 3.6t-.55 4Zm2.4 12.5q-1.45 0-2.48-1.02-1.02-1.03-1.02-2.48t1.02-2.48Q22.5 37 23.95 37t2.48 1.02q1.02 1.03 1.02 2.48t-1.02 2.48Q25.4 44 23.95 44Z"
        fill={color || ColorPalette.Black}
      />
    </svg>
  );
}

export const QuestionMarkIcon = memo(_QuestionMarkIcon);
