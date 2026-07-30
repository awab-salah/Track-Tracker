/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#EFF8FA',
          100: '#D5EDF2',
          200: '#ABDCE6',
          300: '#7CC5D8',
          400: '#4DAEC9',
          500: '#2E97B4',
          600: '#1A7A98',
          700: '#104C64',
          800: '#0D3B4A',
          900: '#092A35',
        },
        orange: {
          50: '#FDF5F0',
          100: '#FAE8DC',
          200: '#F4CDB3',
          300: '#EDB28A',
          400: '#E69762',
          500: '#C97A56',
          600: '#A8603E',
          700: '#874828',
          800: '#663518',
          900: '#45220A',
        },
      },
      fontFamily: {
        cairo: ['Cairo', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.6s ease-out forwards',
        'slide-in-right': 'slideInRight 0.6s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
