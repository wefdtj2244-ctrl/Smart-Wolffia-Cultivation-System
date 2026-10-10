/**
 * Wave Restaurant - Google Analytics 4 (GA4) Tracking Script
 */

const GA_MEASUREMENT_ID = 'G-TYX5JZZ1V6';

// Dynamically load Google Tag Manager script
const script = document.createElement('script');
script.async = true;
script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
document.head.appendChild(script);

// Initialise window dataLayer and gtag configurations
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
window.gtag = gtag; // Make gtag available globally

gtag('js', new Date());
gtag('config', GA_MEASUREMENT_ID);
console.log(`GA4 initialized with ID: ${GA_MEASUREMENT_ID}`);
