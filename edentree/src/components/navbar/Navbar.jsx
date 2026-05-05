import React from 'react'

const NavLinks = [
  { id: 1, name: 'Home', href: '#' },
  { id: 2, name: 'About Us', href: '#' },
  { id: 3, name: 'Locations', href: '#' },
  { id: 4, name: 'Contact Us', href: '#' },
]

const Navbar = () => {
  return (
    <nav className="bg-white shadow-md">
      <div className="overflow:hidden container flex items-center justify-between py-4">
        
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
                /* 
                   1. Added 'block' to ensure the link has a physical area
                   2. Changed content syntax to after:content-[""] 
                   3. Added after:block to ensure the pseudo-element renders
                */
                className="relative block text-xl font-semibold transition-colors duration-300 hover:text-primaryLight 
                           after:block after:content-[''] after:absolute after:h-0.5 after:bg-primary 
                           after:w-0 after:bottom-0 after:left-0 after:transition-all after:duration-300 
                           hover:after:w-full"
              >
                {link.name}
              </a>
            </li>
          ))}
        </ul>

      </div>
    </nav>
  )
}

export default Navbar