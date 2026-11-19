s=open('app.src.html').read()
s=s.replace('/*ENGINE*/',open('engine.js').read()).replace('/*SEED*/null',open('seed.json').read()).replace('/*FACTORY*/null',open('factory.json').read())
open('fx_forward_desk.html','w').write(s)
print(len(s))
