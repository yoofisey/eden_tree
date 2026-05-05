import React from 'react';

const NavLinks = [
  { id: 1, name: 'Home', href: '#' },
  { id: 2, name: 'About Us', href: '#' },
  { id: 3, name: 'Locations', href: '#' },
  { id: 4, name: 'Contact Us', href: '#' },
];

const Navbar = () => {
  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto flex items-center justify-between py-4 px-4">
        
        {/* Logo */}
        <div className="font-heading font-bold text-2xl text-primary">
          Logo
        </div>

        {/* Links */}
        <ul className="flex items-center gap-8 font-sans text-dark">
          {NavLinks.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                className="relative inline-block text-xl font-semibold transition-colors duration-300 hover:text-primaryLight
                           after:content-[''] after:absolute after:left-0 after:-bottom-1 
                           after:h-[2px] after:w-0 after:bg-primary 
                           after:transition-all after:duration-300 hover:after:w-full"
              >
                {link.name}
              </a>
            </li>
          ))}
        </ul>

      </div>
    </nav>
  );
};

export default Navbar;