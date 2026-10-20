import { weekdayThemeFor } from './model.mjs';
import { WEEKDAY_ATLAS_SIZE, WEEKDAY_ICON_FRAMES } from './iconGeometry.mjs';
import { specialActionFor, specialHeadingIcon, specialNavigationIcon } from '../specialThemes/icons.mjs';

export const WEEKDAY_ICON_KINDS = ['dashboard','evaluate','cases','appeal','coaching','library','schedule','users','chat','settings','search','preview','save','export','upload','security'];
const aliases = {
  'appeal-cases':'cases','appeal-review':'appeal','late-appeal':'appeal','pre-test':'save',rubrics:'evaluate',training:'coaching',slides:'library',signatures:'save',guide:'library',calls:'chat',inbox:'appeal','login-log':'schedule','password-reset':'security',permissions:'security',terms:'library',password:'security',logout:'security',profile:'users',edit:'evaluate',score:'dashboard',grade:'evaluate',document:'cases',view:'preview',theme:'dashboard',kpi:'save',appealResult:'appeal',download:'export',people:'users',clock:'schedule',overview:'dashboard',check:'save',process:'library',
};
export const weekdayIconKind = kind => WEEKDAY_ICON_KINDS.includes(kind) ? kind : aliases[kind] || 'dashboard';
export const weekdayActionFor = label => { const kind=specialActionFor(label); return kind ? weekdayIconKind(kind) : ''; };
export const weekdayHeadingIcon = label => { const kind=specialHeadingIcon(label); return kind ? weekdayIconKind(kind) : ''; };
export const weekdayNavigationIcon = key => { const kind=specialNavigationIcon(key); return kind ? weekdayIconKind(kind) : ''; };
export const weekdayIconAtlas = themeId => weekdayThemeFor(themeId)?.atlas || '';
export function weekdayIconPosition(kind, themeId) {
  const index=WEEKDAY_ICON_KINDS.indexOf(weekdayIconKind(kind));
  const frame=WEEKDAY_ICON_FRAMES[themeId]?.[index];
  return frame ? `${(frame[0]-frame[2]/2)/(WEEKDAY_ATLAS_SIZE-frame[2])*100}% ${(frame[1]-frame[2]/2)/(WEEKDAY_ATLAS_SIZE-frame[2])*100}%` : `${index%4*100/3}% ${Math.floor(index/4)*100/3}%`;
}
export function weekdayIconSize(kind, themeId) {
  const frame=WEEKDAY_ICON_FRAMES[themeId]?.[WEEKDAY_ICON_KINDS.indexOf(weekdayIconKind(kind))];
  return frame ? `${WEEKDAY_ATLAS_SIZE/frame[2]*100}% ${WEEKDAY_ATLAS_SIZE/frame[2]*100}%` : '400% 400%';
}
export const weekdayIconStyle = (themeId,kind) => ({'--weekday-icon-atlas':`url("${weekdayIconAtlas(themeId)}")`,'--weekday-control-position':weekdayIconPosition(kind,themeId),'--weekday-control-size':weekdayIconSize(kind,themeId)});
