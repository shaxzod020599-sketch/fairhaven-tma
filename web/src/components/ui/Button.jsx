import React, { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Magnetic from '../../motion/Magnetic.jsx';
import './Button.css';

// One element for every button look: a router Link with `to`, a plain link with `href`, else a <button>.
const Base = forwardRef(function Base({ to, href, type = 'button', ...props }, ref) {
  if (to != null) return <Link ref={ref} to={to} {...props} />;
  if (href != null) return <a ref={ref} href={href} {...props} />;
  return <button ref={ref} type={type} {...props} />;
});

/**
 * Pill button. variant: 'primary' (ink, sun sweeps in on hover), 'secondary' (outlined), 'ghost',
 * 'stage' (sun fill for dark sections, white sweep). size: 'sm' | 'md' | 'lg'.
 *   <Button to="/shop" iconEnd={<ArrowRight />} magnetic>Перейти в каталог</Button>
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', block = false, magnetic = false, iconStart, iconEnd, className = '', children, ...rest },
  ref
) {
  const cls = ['ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, block && 'ui-btn--block', className].filter(Boolean).join(' ');
  const button = (
    <Base ref={ref} className={cls} {...rest}>
      <span className="ui-btn-label">
        {iconStart}
        {children}
        {iconEnd}
      </span>
    </Base>
  );
  return magnetic ? <Magnetic className={block ? 'ui-btn-magnet--block' : ''}>{button}</Magnetic> : button;
});

/**
 * Round 44 px button holding one icon. `label` is required: it is the accessible name.
 * variant: 'plain' | 'outline' | 'solid'.  <IconButton label={t('close')} onClick={…}><Close /></IconButton>
 */
export const IconButton = forwardRef(function IconButton(
  { label, variant = 'plain', size = 'md', className = '', children, ...rest },
  ref
) {
  return (
    <Base
      ref={ref}
      aria-label={label}
      title={rest.title ?? label}
      className={`ui-iconbtn ui-iconbtn--${variant} ui-iconbtn--${size} ${className}`}
      {...rest}
    >
      {children}
    </Base>
  );
});

export default Button;
